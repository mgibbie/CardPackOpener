'use strict';
// cache-busting: the ?v=… on this script's own URL is propagated to every
// sub-resource we load (data, cardart, keywords) so bumping the version in
// index.html forces clients onto fresh code+data with no manual hard-refresh.
const CB = (() => { try { return new URL(document.currentScript.src).search; } catch (e) { return ''; } })();
// Static, read-only design wiki. Data is served as flat JSON from ./data/.
// Designers change content by editing designwiki/data/*.json in the repo.
const DB = {};
const content = document.getElementById('content');
const statusEl = document.getElementById('status');
const searchEl = document.getElementById('search');
let abilityByName = {};

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const titleCase = s => String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e[k] = attrs[k];
    else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  // (flattened all the way: a nested list of nodes — [' Add-ons: ', list.map(x => [', ', link])] — must
  // append its nodes, not print the array's toString "…,https://…" as text)
  for (const kid of kids.flat(Infinity)) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const typesArr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
const typeChip = t => h('span', { class: 'chip t-' + t }, t);
const pkLink = id => DB.pokemon[id] ? h('a', { href: '#/pokemon/' + id, class: 'species-link' }, DB.pokemon[id].name) : h('span', null, id || '?');
const spriteImg = p => p && p.sprite ? h('img', { class: 'sprite', src: 'sprites/' + p.sprite, alt: p.name, onerror: e => e.target.remove() }) : null;
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
// dex label: national number for standard mons, ✦ for custom/fakémon (negative id)
const dexLabel = p => (p.num != null && p.num > 0) ? '#' + String(p.num).padStart(4, '0') : '✦';
// Dex order: national dex (positive nums) first, custom mons (negative ids) after.
const dexKey = n => n == null ? 2e9 : (n > 0 ? n : 1e9 - n);
const byDex = (a, b) => dexKey(a.num) - dexKey(b.num);
// Encounters are stored as raw game slots; aggregate by species for display.
function aggSlots(enc) {
  if (enc.mons) return enc.mons; // legacy pre-aggregated data
  const m = new Map();
  for (const s of enc.slots || []) {
    const a = m.get(s.species);
    if (a) { a.minLevel = Math.min(a.minLevel, s.minLevel); a.maxLevel = Math.max(a.maxLevel, s.maxLevel); a.weight += s.weight; }
    else m.set(s.species, { species: s.species, minLevel: s.minLevel, maxLevel: s.maxLevel, weight: s.weight });
  }
  return [...m.values()].sort((a, b) => b.weight - a.weight);
}
const mvLink = id => DB.moves[id] ? h('a', { href: '#/moves/' + id }, DB.moves[id].name) : h('span', { class: 'muted' }, id);
const abLink = nm => { const id = abilityByName[norm(nm)]; return id ? h('a', { href: '#/abilities/' + id }, nm) : h('span', null, nm); };

function listView(file, title, items) {
  const q = norm(searchEl.value);
  const filtered = items.filter(it => norm(it.name).includes(q) || norm(it.id).includes(q));
  content.replaceChildren(
    h('h1', null, title, ' ', h('span', { class: 'num' }, '(' + filtered.length + ')')),
    h('div', { class: 'grid' }, filtered.map(it =>
      h('a', { class: 'card', href: '#/' + file + '/' + it.id },
        h('div', { class: 'nm' }, it.num != null ? h('span', { class: 'num' }, '#' + it.num + ' ') : null, it.name),
        it.sub ? h('div', { class: 'muted' }, it.sub) : null)))
  );
}

function kv(label, value) { return h('tr', null, h('th', null, label), h('td', null, value)); }

// National-dex style grid: sprite thumbnail + number + name + type chips.
// Standard species show their national number; custom/fakemon get a ✦.
function pokedexView() {
  const q = norm(searchEl.value);
  const list = Object.values(DB.pokemon).sort(byDex)
    .filter(p => !q || norm(p.name).includes(q) || String(p.num || '').includes(q));
  const custom = list.filter(p => (p.num || 0) < 0).length;
  content.replaceChildren(
    h('h1', null, 'Pokédex ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'National dex order · ' + (list.length - custom) + ' standard + ' + custom + ' custom/fakémon (✦). Click any entry for full stats, abilities & moves.'),
    h('div', { class: 'dex-grid' }, list.map(p =>
      h('a', { class: 'dex-tile', href: '#/pokemon/' + p.id },
        h('div', { class: 'dex-spr' }, p.sprite
          ? h('img', { class: 'sprite', loading: 'lazy', src: 'sprites/' + p.sprite, alt: p.name, onerror: e => e.target.remove() }) : null),
        h('div', { class: 'dex-meta' },
          h('div', { class: 'num' }, dexLabel(p)),
          h('div', { class: 'nm' }, p.name),
          h('div', { class: 'dex-types' }, typesArr(p.types).map(typeChip))))))
  );
}

// Two gap-tracking pages: imported fakemon still missing sourced data.
function gapTile(p, badges) {
  return h('a', { class: 'dex-tile', href: '#/pokemon/' + p.id },
    h('div', { class: 'dex-spr' }, p.sprite
      ? h('img', { class: 'sprite', loading: 'lazy', src: 'sprites/' + p.sprite, alt: p.name, onerror: e => e.target.remove() }) : null),
    h('div', { class: 'dex-meta' },
      h('div', { class: 'nm' }, p.name),
      h('div', { class: 'dex-types' }, typesArr(p.types).map(typeChip)),
      h('div', { class: 'gap-badges' }, badges)));
}
// The cry worklist: species with no cry file at all, plus groups sharing one
// byte-identical recording (form-shares may be canon-fine; the fakemon batches
// are placeholders). Donor/borrowed cries were explicitly rejected — a silent
// species stays silent until it gets an ORIGINAL recording. Data comes from
// tools/gen_missing_cries.mjs --write; rerun it after adding .ogg files.
let criesPromise = null;
const loadMissingCries = () => {
  if (!criesPromise) criesPromise = fetch('data/missing_cries.json' + CB).then(r => {
    if (!r.ok) throw new Error('cry worklist unavailable');
    return r.json();
  });
  return criesPromise;
};
async function missingCriesView() {
  content.replaceChildren(h('h1', null, 'Missing Cries'), h('p', { class: 'muted' }, 'Loading the cry worklist…'));
  let data;
  try { data = await loadMissingCries(); } catch (e) {
    return content.replaceChildren(h('h1', null, 'Missing Cries'), h('p', { class: 'muted' }, 'Could not load the cry worklist.'));
  }
  if ((location.hash.slice(1).split('/').filter(Boolean))[0] !== 'missing-cries') return;
  const q = norm(searchEl.value);
  const hit = id => { const pk = DB.pokemon[id]; return pk && (!q || norm(pk.name).includes(q) || norm(id).includes(q)); };
  const missing = (data.missing || []).filter(hit);
  const groups = (data.shared || []).filter(g => g.some(hit));
  content.replaceChildren(
    h('h1', null, 'Missing Cries ', h('span', { class: 'num' },
      '(' + (data.missing || []).length + ' silent · ' + (data.shared || []).length + ' shared groups)')),
    h('p', { class: 'muted' }, 'The recording worklist. SILENT species have no cry file and stay mute until an original recording lands '
      + '(borrowed cries are not used, by design). Below them: groups of species whose files are byte-identical copies of one '
      + 'recording — regional-form shares may be fine, the fakémon batches are placeholders. Drop new recordings at '
      + 'overworld/data/sounds/cries/<id>.ogg, then rerun tools/gen_missing_cries.mjs --write.'),
    h('h2', null, 'No cry at all ', h('span', { class: 'num' }, '(' + missing.length + ')')),
    missing.length
      ? h('div', { class: 'dex-grid' }, missing.map(id => gapTile(DB.pokemon[id], [])))
      : h('p', null, q ? 'No silent species match the search.' : 'None — every species has its own recording.'),
    h('h2', null, 'Sharing one recording ', h('span', { class: 'num' }, '(' + groups.length + ' groups)')),
    ...groups.map(g => h('div', null,
      h('p', { class: 'muted' }, g.map(id => (DB.pokemon[id] || {}).name || id).join(' · ')),
      h('div', { class: 'dex-grid' }, g.filter(id => DB.pokemon[id]).map(id => gapTile(DB.pokemon[id], [])))))
  );
}

function needsTypingView() {
  const q = norm(searchEl.value);
  const list = Object.values(DB.pokemon).filter(p => p.needsType)
    .filter(p => !q || norm(p.name).includes(q)).sort(byName);
  content.replaceChildren(
    h('h1', null, 'Needs Typing ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'Imported fakémon whose real type was never sourced — they still carry the placeholder Grass typing (and the placeholder ability). Find their real types (e.g. on Pokéngine) to finish them.'),
    h('div', { class: 'dex-grid' }, list.map(p => gapTile(p, [h('span', { class: 'gap-badge gap-t' }, 'placeholder GRASS')])))
  );
}
function needsDataView() {
  const q = norm(searchEl.value);
  const list = Object.values(DB.pokemon).filter(p => p.needsMoves)
    .filter(p => !q || norm(p.name).includes(q)).sort(byName);
  const nMoves = list.filter(p => p.gapMoves).length, nAbil = list.filter(p => p.gapAbility).length;
  content.replaceChildren(
    h('h1', null, 'Needs Moves / Abilities ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'Fakémon that got a real type + stats but still need work: ' + nMoves + ' missing a real level-up moveset, ' + nAbil + ' still on the placeholder ability.'),
    h('div', { class: 'dex-grid' }, list.map(p => gapTile(p, [
      p.gapMoves ? h('span', { class: 'gap-badge gap-m' }, 'no moveset') : null,
      p.gapAbility ? h('span', { class: 'gap-badge gap-a' }, 'placeholder ability') : null
    ].filter(Boolean))))
  );
}

function pokemonDetail(id) {
  const p = DB.pokemon[id]; if (!p) return notFound();
  const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const moveSection = (title, list) => (list && list.length) ? [
    h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('div', null, list.map((m, i) => [i ? ', ' : '', mvLink(m)]).flat())
  ] : [];
  content.replaceChildren(
    h('h1', null, h('span', { class: 'num' }, dexLabel(p) + ' '), p.name),
    spriteImg(p),
    h('div', null, typesArr(p.types).map(typeChip)),
    h('div', { style: 'margin:8px 0' }, 'Abilities: ', typesArr(p.abilities).map((a, i) => [i ? ', ' : '', abLink(a)]).flat()),
    h('h2', null, 'Base Stats'),
    h('table', null, h('tbody', null, stats.map(s => {
      const v = (p.baseStats || {})[s] || 0;
      return h('tr', null, h('th', null, s.toUpperCase()), h('td', null, String(v)),
        h('td', null, h('div', { class: 'statbar' }, h('span', { style: 'width:' + Math.min(100, v / 2) + '%' }))));
    }))),
    h('h2', null, 'Level-Up Moves'),
    h('table', null, h('thead', null, h('tr', null, h('th', null, 'Lv'), h('th', null, 'Move'))),
      h('tbody', null, (p.levelUpLearnset || []).map(e => h('tr', null, h('td', null, e[0]), h('td', null, mvLink(e[1])))))),
    ...moveSection('Moves Learned by TM', p.tmMoves),
    ...moveSection('Egg Moves', p.eggMoves),
    ...moveSection('HM Moves', p.hmMoves)
  );
}

function moveDetail(id) {
  const m = DB.moves[id]; if (!m) return notFound();
  const learned = m.learnedBy || [];
  content.replaceChildren(
    h('h1', null, m.name),
    h('table', null, h('tbody', null,
      kv('Type', m.type), kv('Category', m.category), kv('Power', m.basePower ?? '—'),
      kv('Accuracy', m.accuracy ?? '—'), kv('PP', m.pp ?? '—'), kv('Priority', m.priority ?? 0))),
    h('h2', null, 'Learned by ', h('span', { class: 'num' }, '(' + learned.length + ')')),
    learned.length ? h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Pokémon'), h('th', null, 'How'))),
      h('tbody', null, learned.map(e => h('tr', null, h('td', null, pkLink(e.pokemon)), h('td', null, e.how)))))
      : h('p', { class: 'muted' }, 'Not learned by any Pokémon.')
  );
}

function abilityDetail(id) {
  const a = DB.abilities[id]; if (!a) return notFound();
  content.replaceChildren(
    h('h1', null, a.name),
    h('p', null, a.description || h('span', { class: 'muted' }, 'No description.')),
    h('h2', null, 'Pokémon with ' + a.name + ' ', h('span', { class: 'num' }, '(' + (a.pokemon || []).length + ')')),
    h('div', { class: 'grid' }, (a.pokemon || []).map(pid =>
      h('a', { class: 'card', href: '#/pokemon/' + pid }, h('div', { class: 'nm' }, (DB.pokemon[pid] || {}).name || pid))))
  );
}

function tmsView() {
  const q = norm(searchEl.value);
  const match = t => !q || norm(t.tm || '').includes(q) || norm(t.name).includes(q)
    || (t.move && norm(t.move).includes(q));
  const tms = (DB.tms.tms || []).filter(match);
  const hms = (DB.tms.hms || []).filter(match);
  const head = (first) => h('thead', null, h('tr', null,
    [first, 'Move', 'Type', 'Cat.', 'Power', 'Acc.', 'Pokémon'].map(x => h('th', null, x))));
  const row = (label, t) => {
    const m = DB.moves[t.move] || {};
    return h('tr', null,
      h('td', { class: 'num' }, t.move ? h('a', { href: '#/moves/' + t.move }, label) : label),
      h('td', null, t.move ? mvLink(t.move) : t.name),
      h('td', null, m.type ? typeChip(m.type) : '—'),
      h('td', null, m.category || '—'),
      h('td', null, m.basePower ?? '—'),
      h('td', null, m.accuracy ?? '—'),
      h('td', { class: 'num' }, String((m.learnedBy || []).length)));
  };
  content.replaceChildren(
    h('h1', null, 'TMs ', h('span', { class: 'num' }, '(' + tms.length + ')')),
    h('p', { class: 'muted' }, 'Technical Machines (Scarlet & Violet numbering, TM001–TM229). Click a move for its full learn list.'),
    h('table', null, head('TM'), h('tbody', null, tms.map(t => row(t.tm, t)))),
    hms.length ? h('h2', null, 'HMs ', h('span', { class: 'num' }, '(' + hms.length + ')')) : null,
    hms.length ? h('table', null, head('HM'),
      h('tbody', null, hms.map((t, i) => row('HM' + String(i + 1).padStart(2, '0'), t)))) : null
  );
}

function unlearnedView() {
  const q = norm(searchEl.value);
  const list = Object.values(DB.moves)
    .filter(m => !(m.learnedBy || []).length)
    .filter(m => !q || norm(m.name).includes(q))
    .sort(byName);
  content.replaceChildren(
    h('h1', null, 'Moves Not Learned by Any Mon ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'Moves no Pokémon can currently learn by any method (level-up, TM, egg, or HM).'),
    h('div', { class: 'grid' }, list.map(m =>
      h('a', { class: 'card', href: '#/moves/' + m.id }, h('div', { class: 'nm' }, m.name))))
  );
}

function regionView(rk) {
  const r = DB.regions[rk]; if (!r) return notFound();
  const maps = Object.values(r.maps).sort((a, b) => a.name.localeCompare(b.name));
  const blocks = maps.map(mp => {
    const encTables = (mp.encounters || []).map(enc => h('div', null,
      h('div', { class: 'muted' }, titleCase(enc.method) + (enc.rate ? ' · rate ' + enc.rate : '')),
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Species'), h('th', null, 'Levels'), h('th', null, 'Weight'))),
        h('tbody', null, aggSlots(enc).map(mon => h('tr', null,
          h('td', null, pkLink(mon.species)),
          h('td', null, mon.minLevel === mon.maxLevel ? String(mon.minLevel) : mon.minLevel + '–' + mon.maxLevel),
          h('td', null, String(mon.weight))))))));
    const trTable = mp.trainers.length ? h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Class'), h('th', null, 'Name'), h('th', null, 'Party'))),
      h('tbody', null, mp.trainers.map(t => h('tr', null,
        h('td', null, t.class), h('td', null, t.name),
        h('td', null, t.party.map((pm, pi) => h('span', null, pi ? ', ' : '', pkLink(pm.species), ' @' + pm.level)))))))
      : h('div', { class: 'muted' }, 'No trainers.');
    return h('div', { class: 'route' },
      h('h3', null, mp.name),
      (mp.encounters || []).length ? h('div', null, h('strong', null, 'Wild Encounters'), encTables) : null,
      h('div', null, h('strong', null, 'Trainers ', h('span', { class: 'num' }, '(' + mp.trainers.length + ')')), trTable));
  });
  content.replaceChildren(
    h('h1', null, r.label, ' ', h('span', { class: 'num' }, '(' + maps.length + ' routes/areas)')),
    h('p', { class: 'muted' }, 'Wild encounters and trainers by location.'),
    ...blocks);
}


// Card Gallery — every card in Battlecards, drawn with its real in-game face via
// the sibling battlecards/cardart.js. Card data, art, and the renderer are all
// lazy-loaded the first time a card view opens.
let cardsPromise = null, cardartPromise = null, artAuditPromise = null, artPlaceholdersPromise = null, CardArt = null, CardKw = null, kwIndex = null;
let cardClassFilter = 'all';
function loadCards() {
  if (!cardsPromise) cardsPromise = fetch('../battlecards/cards.json' + CB).then(r => r.json()).then(d => d.cards || d || []);
  return cardsPromise;
}
function loadArtAudit() {
  if (!artAuditPromise) artAuditPromise = fetch('../battlecards/art/audit-report.json' + CB).then(r => {
    if (!r.ok) throw new Error('Artwork audit unavailable');
    return r.json();
  });
  return artAuditPromise;
}
// Cards that render a reused stand-in image but still want their own authentic art.
// They live in art/index.json (so the game shows a real picture) yet must still
// surface on /missing-art. Sibling of cards.json — served by the site, not the art CDN.
function loadArtPlaceholders() {
  if (!artPlaceholdersPromise) artPlaceholdersPromise = fetch('../battlecards/art-placeholders.json' + CB)
    .then(r => r.ok ? r.json() : { cards: [] })
    .then(d => Array.isArray(d) ? d : (d.cards || []))
    .catch(() => []);
  return artPlaceholdersPromise;
}
function loadCardart() {
  // the renderer (cardart) and the keyword glossary (keywords) both live in battlecards/
  if (!cardartPromise) cardartPromise = Promise.all([
    import('../battlecards/cardart.js' + CB),
    import('../battlecards/keywords.js' + CB),
  ]).then(([a, k]) => { CardArt = a; CardKw = k; });
  return cardartPromise;
}
// dungeon-run data (starter decks + boss ladder) and the class registry
let dungeonPromise = null, classesPromise = null;
function loadDungeon() {
  if (!dungeonPromise) dungeonPromise = import('../battlecards/dungeon.js' + CB);
  return dungeonPromise;
}
function loadClasses() {
  if (!classesPromise) classesPromise = fetch('../battlecards/classes.json' + CB).then(r => r.json()).then(d => d.classes || []);
  return classesPromise;
}
// Dalaran Heist data (heroes, wings, bosses, passives + buildBossDeck)
let heistPromise = null;
function loadHeist() {
  if (!heistPromise) heistPromise = import('../battlecards/heist.js' + CB);
  return heistPromise;
}
// Tombs of Terror data (Explorers, chapters, bosses, passives + buildBossDeck)
let tombsPromise = null;
function loadTombs() {
  if (!tombsPromise) tombsPromise = import('../battlecards/tombs.js' + CB);
  return tombsPromise;
}
// Duels data (heroes, passives, hero-power map, arena draft + loot buckets + rivals)
let duelsPromise = null;
function loadDuels() {
  if (!duelsPromise) duelsPromise = import('../battlecards/duels.js' + CB);
  return duelsPromise;
}
// Lorequest data (planeswalker + boss rosters, class-of map, deck helpers)
let lorequestPromise = null;
function loadLorequest() {
  if (!lorequestPromise) lorequestPromise = import('../battlecards/lorequest.js' + CB);
  return lorequestPromise;
}
// Lorequest: Middle-earth data (hero/enemy rosters, rungs, class map, hero powers)
let middleearthPromise = null;
function loadMiddleearth() {
  if (!middleearthPromise) middleearthPromise = import('../battlecards/middleearth.js' + CB);
  return middleearthPromise;
}
// Lorequest: Sword Coast data (D&D — hero/enemy rosters, rungs, class map, hero powers)
let swordcoastPromise = null;
function loadSwordcoast() {
  if (!swordcoastPromise) swordcoastPromise = import('../battlecards/swordcoast.js' + CB);
  return swordcoastPromise;
}
// Lorequest: Final Fantasy data (FF — hero/enemy rosters, rungs, class map, hero powers)
let finalfantasyPromise = null;
function loadFinalfantasy() {
  if (!finalfantasyPromise) finalfantasyPromise = import('../battlecards/finalfantasy.js' + CB);
  return finalfantasyPromise;
}
// Lorequest: Multiverse data (Marvel — WIN-PARITY hero/villain rosters, rungs, class map, hero powers)
let multiversePromise = null;
function loadMultiverse() {
  if (!multiversePromise) multiversePromise = import('../battlecards/multiverse.js' + CB);
  return multiversePromise;
}
// build (once) an index: keyword slug -> { label, text, cards: [] } across the pool
function keywordIndex(cards) {
  if (kwIndex) return kwIndex;
  kwIndex = new Map();
  for (const c of cards) for (const k of CardKw.keywordsFor(c)) {
    const slug = norm(k.label);
    let e = kwIndex.get(slug);
    if (!e) { e = { label: k.label, text: k.text, cards: [] }; kwIndex.set(slug, e); }
    e.cards.push(c);
  }
  return kwIndex;
}
const kwChip = label => h('a', { class: 'tag-chip kw', href: '#/keyword/' + norm(label) }, label);
const cardTypeChip = type => h('a', { class: 'tag-chip type', href: '#/type/' + norm(type) }, titleCase(type || ''));
const SPELL_TYPES = new Set(['sorcery', 'instant', 'secret', 'trap']);
// a card's tribe field is a space-separated list ("Murloc Warrior" = two tribes)
const tribesOf = c => (c.tribe ? (Array.isArray(c.tribe) ? c.tribe : String(c.tribe).trim().split(/\s+/)) : []).filter(Boolean);
// one chip per tribe. A spell's tag is its SCHOOL (own page); a creature's is its
// tribe (own page) — even when the word is shared (e.g. Fire spell vs Fire tribe).
const tribeChip = (c, tribe) => SPELL_TYPES.has(c.type)
  ? h('a', { class: 'tag-chip school', href: '#/school/' + norm(tribe) }, tribe + ' Spell')
  : h('a', { class: 'tag-chip tribe', href: '#/tribe/' + norm(tribe) }, tribe);
const canonClass = c => (CardArt ? CardArt.canonClass(c.cardClass || 'neutral') : (c.cardClass || 'neutral'));
const isDualClass = c => canonClass(c).includes('__');
// uncollectible / system cards get their own filter buckets instead of a class:
// all Lands together, the five WUBRG colours (non-land), then a Generic catch-all
const SYSTEM_BUCKETS = [
  ['__land__', 'Lands'], ['__advland__', 'Advanced Lands'],
  ['__generic__', 'Generic'],
  ['__plane__', 'Planes'], ['__excavate__', 'Excavate'], ['__appendage__', 'Appendages'],
];
const SYSTEM_KEYS = new Set(SYSTEM_BUCKETS.map(b => b[0]));
// WUBRG is independent of class: multicolour cards belong to every matching
// colour category, and every colour can be filtered or opened from a card page.
const CARD_COLORS = [['W', 'White'], ['U', 'Blue'], ['B', 'Black'], ['R', 'Red'], ['G', 'Green'], ['C', 'Colorless']];
const COLOR_NAMES = Object.fromEntries(CARD_COLORS);
const colorsOf = c => Array.isArray(c.colors) ? c.colors : (c.colors ? String(c.colors).split('').filter(Boolean) : []);
// Lands retain their mana-production data, but are colorless for card
// categorization and belong only to the Lands section.
const categoryColorsOf = c => c.type === 'land' ? [] : colorsOf(c);
const displayColorsOf = c => c.type === 'land' ? ['C'] : colorsOf(c);
const colorName = code => COLOR_NAMES[code] || code;
const colorChip = (code, card) => h('a', { class: 'tag-chip color', title: colorName(code), href: card?.type === 'land' ? '#/cards?class=__land__' : '#/cards?color=' + encodeURIComponent(code) }, manaSym(code, 13), ' ', colorName(code));
// small WUBRG(C) mana pips for the Land Pools views
const COLOR_PIP_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];
// authentic MTG mana symbols (Andrew Gioia's Mana font — loaded in index.html), not plain colour dots
const MS_OF = { W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c' };
const manaSym = (code, size = 15) => h('i', { class: 'ms ms-cost ' + (MS_OF[code] || 'ms-c'), title: colorName(code), style: `font-size:${size}px;vertical-align:-2px;margin:0 1px;` });
function colorPips(cols) {
  const use = COLOR_PIP_ORDER.filter(c => (cols || []).includes(c));
  return h('span', { class: 'lp-pips' }, ...(use.length ? use : ['C']).map(c => manaSym(c)));
}
// derive a land's pool set + colour identity + tier from its taps
function landInfo(c, allCards) {
  let landSet = null;
  const cols = [];
  for (const t of (c.taps || [])) for (const e of (t.effects || [])) {
    if (e.landSet) landSet = e.landSet;
    if (e.type === 'boost' && e.color && !cols.includes(e.color)) cols.push(e.color);
  }
  const count = landSet ? allCards.filter(x => x.landSet === landSet && !x.token).length : 0;
  const isBasic = BASIC_LAND_SETS.includes(landSet);
  const tier = isBasic ? 'basic' : cols.length >= 3 ? 'three' : cols.length === 2 ? 'two' : cols.length === 1 ? 'mono' : 'colorless';
  return { id: c.id, name: c.name, landSet, colors: COLOR_PIP_ORDER.filter(x => cols.includes(x)), count, tier };
}
// theme words an advanced land can conjure (matched against a card's name) — once
let advThemes = null;
function ensureAdvThemes(cards) {
  if (advThemes) return;
  advThemes = new Set();
  for (const c of cards) if (c.type === 'land') for (const tap of (c.taps || [])) for (const e of (tap.effects || []))
    if (e.type === 'conjure-named' && e.match) advThemes.add(e.match.toLowerCase());
}
function systemBucket(c) {
  if (c.excavate) return '__excavate__'; // excavate rewards (Azerite legendaries, …)
  if (c.colossalOf) return '__appendage__'; // Colossal appendage tokens
  if (c.type === 'land') return '__land__';
  if (c.type === 'plane') return '__plane__';
  if (c.type === 'emblem') return '__generic__'; // dungeon-run treasures / emblems
  if ((c.tribe || '').split(/\s+/).includes('Token')) return '__generic__'; // Token-tribe cards (Blood/Clue/Food/Treasure)
  if (c.id === 'coin' || c.id === 'banana') return '__generic__'; // neutral token spells
  const cols = colorsOf(c);
  // Coloured paper cards remain in their normal class and are categorized by
  // the dedicated colour filter instead of being forced into one WUBRG bucket.
  if (cols.some(col => ['W', 'U', 'B', 'R', 'G'].includes(col))) return null;
  if (canonClass(c) === 'magepunk') {
    // paper system cards: ones a land conjures (name matches a theme) are Advanced
    // Lands; the rest (Blood Gem) are Generic
    const nm = (c.name || '').toLowerCase();
    if (advThemes) for (const t of advThemes) if (nm.includes(t)) return '__advland__';
    return '__generic__';
  }
  if (cols.includes('C')) return '__generic__';
  // any OTHER uncollectible (summon/conjure tokens, corrupted forms, boss
  // cards, ...) sorts under Generic instead of masquerading as a class card
  if (CardArt && CardArt.isUncollectible(c)) return '__generic__';
  return null; // an ordinary collectible card — stays under its class
}

const CARD_FILTER_DEFAULTS = {
  class: 'all', color: 'all', type: 'all', rarity: 'all', set: 'all', tribe: 'all',
  keyword: 'all', collectible: 'all', art: 'all', minCost: '', maxCost: '',
  basicLandSet: 'all', advLandSet: 'all',
  sort: 'class-cost-name', size: 'medium'
};
// Land Sets: the cards a land generates, tagged via `landSet`. The 5 basics are named; the rest
// (e.g. Abzan) are advanced. These are two browsable "lists of lists", separate from the colours.
const BASIC_LAND_SETS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
let cardFilters = { ...CARD_FILTER_DEFAULTS };
let cardGalleryToken = 0;

function cardQueryParams() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(cardFilters)) if (v !== '' && v !== CARD_FILTER_DEFAULTS[k]) p.set(k, v);
  const q = searchEl.value.trim();
  if (q) p.set('q', q);
  return p;
}
function cardQuerySuffix() {
  const q = cardQueryParams().toString();
  return q ? '?' + q : '';
}
function readCardFilters() {
  const raw = (location.hash.split('?')[1] || '');
  const p = new URLSearchParams(raw);
  cardFilters = { ...CARD_FILTER_DEFAULTS };
  for (const k of Object.keys(CARD_FILTER_DEFAULTS)) if (p.has(k)) cardFilters[k] = p.get(k);
  searchEl.value = p.get('q') || '';
}
function syncCardFilterUrl() {
  const suffix = cardQuerySuffix();
  history.replaceState(null, '', '#/cards' + suffix);
}
function setCardFilter(key, value, cards, report) {
  cardFilters[key] = value;
  syncCardFilterUrl();
  renderCards(cards, report);
}
function resetCardFilters(cards, report) {
  cardFilters = { ...CARD_FILTER_DEFAULTS };
  searchEl.value = '';
  syncCardFilterUrl();
  renderCards(cards, report);
}
function cardField(c, ...keys) {
  for (const k of keys) if (c[k] != null && c[k] !== '') return String(c[k]);
  return '';
}
function rarityRank(r) {
  return ({ free: 0, common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 })[String(r || '').toLowerCase()] ?? 9;
}
function missingArtIds(report) {
  return new Set([...(report.wikiNotFound || []), ...(report.errors || [])].map(x => x.id).filter(Boolean));
}
function uniqueSorted(values, labelFn) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(labelFn ? labelFn(a) : a).localeCompare(String(labelFn ? labelFn(b) : b)));
}
function filterSelect(label, key, values, cards, report, labelFn) {
  const options = [h('option', { value: 'all' }, 'Any')];
  for (const v of values) options.push(h('option', { value: v }, labelFn ? labelFn(v) : titleCase(v)));
  const select = h('select', {
    class: 'adv-select',
    onchange: e => setCardFilter(key, e.target.value, cards, report)
  }, ...options);
  select.value = cardFilters[key];
  return h('label', { class: 'adv-field' }, h('span', null, label), select);
}
function costSelect(label, key, cards, report) {
  const select = h('select', {
    class: 'adv-select cost-select',
    onchange: e => setCardFilter(key, e.target.value, cards, report)
  }, h('option', { value: '' }, 'Any'), ...Array.from({ length: 21 }, (_, n) => h('option', { value: String(n) }, String(n) + (n === 20 ? '+' : ''))));
  select.value = cardFilters[key];
  return h('label', { class: 'adv-field' }, h('span', null, label), select);
}
function activeCardFilterChips(cards, report) {
  const labels = {
    class: 'Class', color: 'Color', type: 'Type', rarity: 'Rarity', set: 'Set', tribe: 'Tribe/School',
    keyword: 'Keyword', collectible: 'Collection', art: 'Art', minCost: 'Min cost',
    maxCost: 'Max cost', basicLandSet: 'Basic Land Set', advLandSet: 'Advanced Land Set', sort: 'Sort', size: 'Size'
  };
  const chips = [];
  for (const [key, value] of Object.entries(cardFilters)) {
    if (value === '' || value === CARD_FILTER_DEFAULTS[key]) continue;
    chips.push(h('button', {
      class: 'active-filter',
      title: 'Remove ' + labels[key] + ' filter',
      onclick: () => setCardFilter(key, CARD_FILTER_DEFAULTS[key], cards, report)
    }, labels[key] + ': ' + (key === 'color' ? colorName(value) : titleCase(value)), ' ×'));
  }
  if (searchEl.value.trim()) chips.push(h('button', {
    class: 'active-filter',
    onclick: () => { searchEl.value = ''; syncCardFilterUrl(); renderCards(cards, report); }
  }, 'Search: ' + searchEl.value.trim(), ' ×'));
  return chips;
}

async function cardGalleryView() {
  content.replaceChildren(h('h1', null, 'Card Gallery'), h('p', { class: 'muted' }, 'Loading cards and filters…'));
  let cards, report;
  try {
    [cards, report] = await Promise.all([loadCards(), loadArtAudit().catch(() => ({})), loadCardart().then(() => null)]);
  } catch (e) {
    return content.replaceChildren(h('h1', null, 'Card Gallery'), h('p', { class: 'muted' }, 'Could not load the card data.'));
  }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'cards') return;
  readCardFilters();
  renderCards(cards, report);
}
function renderCards(cards, report = {}) {
  ensureAdvThemes(cards);
  const token = ++cardGalleryToken;
  const q = norm(searchEl.value);
  const missing = missingArtIds(report);

  const counts = {}; let dual = 0;
  for (const c of cards) {
    const sb = systemBucket(c);
    if (sb) counts[sb] = (counts[sb] || 0) + 1;
    else if (isDualClass(c)) dual++;
    else { const k = canonClass(c); counts[k] = (counts[k] || 0) + 1; }
  }
  const classes = Object.keys(counts).filter(k => !k.startsWith('__')).sort((a, b) => counts[b] - counts[a]);
  const classValues = [...classes, ...(dual ? ['__dual__'] : []), ...SYSTEM_BUCKETS.filter(([k]) => counts[k]).map(([k]) => k)];
  const classLabel = v => {
    if (v === '__dual__') return 'Dual (' + dual + ')';
    const sys = SYSTEM_BUCKETS.find(([k]) => k === v);
    return (sys ? sys[1] : CardArt.classNameOf(v)) + ' (' + (counts[v] || 0) + ')';
  };
  const colorCounts = Object.fromEntries(CARD_COLORS.map(([code]) => [code, cards.filter(c => categoryColorsOf(c).includes(code)).length]));
  const colorValues = CARD_COLORS.filter(([code]) => colorCounts[code]).map(([code]) => code);
  const colorFilterLabel = code => colorName(code) + ' (' + colorCounts[code] + ')';
  const types = uniqueSorted(cards.map(c => c.type));
  const rarities = uniqueSorted(cards.map(c => c.rarity), r => String(rarityRank(r)).padStart(2, '0') + r);
  const sets = uniqueSorted(cards.map(c => cardField(c, 'set', 'cardSet', 'expansion')));
  const tribes = uniqueSorted(cards.flatMap(tribesOf));
  const keywords = uniqueSorted(cards.flatMap(c => CardKw.keywordsFor(c).map(k => k.label)));
  const basicLandSets = BASIC_LAND_SETS.filter(ls => cards.some(c => c.landSet === ls));
  const advLandSets = [...new Set(cards.map(c => c.landSet).filter(Boolean))].filter(ls => !BASIC_LAND_SETS.includes(ls)).sort();
  const landSetLabel = v => v + ' (' + cards.filter(c => c.landSet === v).length + ')';

  let list = cards.filter(c => {
    if (cardFilters.class !== 'all') {
      const sb = systemBucket(c);
      if (cardFilters.class === '__dual__' ? (sb || !isDualClass(c))
        : SYSTEM_KEYS.has(cardFilters.class) ? sb !== cardFilters.class
        : sb || canonClass(c) !== cardFilters.class) return false;
    }
    if (cardFilters.color !== 'all' && !categoryColorsOf(c).includes(cardFilters.color)) return false;
    if (cardFilters.type !== 'all' && String(c.type) !== cardFilters.type) return false;
    if (cardFilters.rarity !== 'all' && String(c.rarity) !== cardFilters.rarity) return false;
    if (cardFilters.set !== 'all' && cardField(c, 'set', 'cardSet', 'expansion') !== cardFilters.set) return false;
    if (cardFilters.basicLandSet !== 'all' && c.landSet !== cardFilters.basicLandSet) return false;
    if (cardFilters.advLandSet !== 'all' && c.landSet !== cardFilters.advLandSet) return false;
    if (cardFilters.tribe !== 'all' && !tribesOf(c).includes(cardFilters.tribe)) return false;
    if (cardFilters.keyword !== 'all' && !CardKw.keywordsFor(c).some(k => k.label === cardFilters.keyword)) return false;
    const uncollectible = CardArt.isUncollectible(c);
    if (cardFilters.collectible === 'collectible' && uncollectible) return false;
    if (cardFilters.collectible === 'uncollectible' && !uncollectible) return false;
    if (cardFilters.art === 'missing' && !missing.has(c.id)) return false;
    if (cardFilters.art === 'available' && missing.has(c.id)) return false;
    const cost = Number(c.cost || 0);
    if (cardFilters.minCost !== '' && cost < Number(cardFilters.minCost)) return false;
    if (cardFilters.maxCost !== '' && (Number(cardFilters.maxCost) === 20 ? cost < 20 : cost > Number(cardFilters.maxCost))) return false;
    if (q && ![c.name, c.id, c.cardClass, c.type, c.description, c.rarity, ...categoryColorsOf(c).flatMap(col => [col, colorName(col)]), cardField(c, 'set', 'cardSet', 'expansion'), ...tribesOf(c)]
      .some(v => norm(v).includes(q))) return false;
    return true;
  });

  const sorters = {
    name: (a, b) => String(a.name).localeCompare(String(b.name)),
    'cost-asc': (a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)),
    'cost-desc': (a, b) => Number(b.cost || 0) - Number(a.cost || 0) || String(a.name).localeCompare(String(b.name)),
    rarity: (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || String(a.name).localeCompare(String(b.name)),
    attack: (a, b) => Number(b.attack || 0) - Number(a.attack || 0) || String(a.name).localeCompare(String(b.name)),
    health: (a, b) => Number(b.health || 0) - Number(a.health || 0) || String(a.name).localeCompare(String(b.name)),
    'class-cost-name': (a, b) => canonClass(a).localeCompare(canonClass(b)) || Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name))
  };
  list.sort(sorters[cardFilters.sort] || sorters['class-cost-name']);

  const panel = h('details', { class: 'advanced-filters', open: '' },
    h('summary', null, 'Filters and sorting'),
    h('div', { class: 'filter-fields' },
      filterSelect('Class', 'class', classValues, cards, report, classLabel),
      filterSelect('Color', 'color', colorValues, cards, report, colorFilterLabel),
      filterSelect('Type', 'type', types, cards, report),
      filterSelect('Rarity', 'rarity', rarities, cards, report),
      filterSelect('Set', 'set', sets, cards, report, titleCase),
      filterSelect('Basic Land Set', 'basicLandSet', basicLandSets, cards, report, landSetLabel),
      filterSelect('Advanced Land Set', 'advLandSet', advLandSets, cards, report, landSetLabel),
      filterSelect('Tribe / school', 'tribe', tribes, cards, report),
      filterSelect('Keyword', 'keyword', keywords, cards, report),
      filterSelect('Collection', 'collectible', ['collectible', 'uncollectible'], cards, report),
      filterSelect('Artwork', 'art', ['available', 'missing'], cards, report),
      costSelect('Minimum cost', 'minCost', cards, report),
      costSelect('Maximum cost', 'maxCost', cards, report),
      filterSelect('Sort by', 'sort', ['class-cost-name', 'name', 'cost-asc', 'cost-desc', 'rarity', 'attack', 'health'], cards, report, v => ({
        'class-cost-name': 'Class, cost, name', name: 'Name A–Z', 'cost-asc': 'Cost: low to high',
        'cost-desc': 'Cost: high to low', rarity: 'Rarity', attack: 'Attack', health: 'Health'
      })[v]),
      filterSelect('Card size', 'size', ['small', 'medium', 'large'], cards, report)
    ),
    h('div', { class: 'filter-actions' },
      h('button', { class: 'clear-filters', onclick: () => resetCardFilters(cards, report) }, 'Clear all filters'),
      h('span', { class: 'muted' }, 'The address updates automatically, so filtered views can be bookmarked or shared.')));

  const chips = activeCardFilterChips(cards, report);
  const grid = h('div', { class: 'card-grid size-' + cardFilters.size });
  const empty = h('div', { class: 'card-empty' },
    h('h2', null, 'No cards match these filters'),
    h('p', { class: 'muted' }, 'Remove a filter or clear them all to see more cards.'),
    h('button', { class: 'clear-filters', onclick: () => resetCardFilters(cards, report) }, 'Clear all filters'));
  const CAP = 48;
  let shown = 0;
  const more = h('button', { class: 'showmore' });
  const renderMore = async () => {
    const batch = list.slice(shown, shown + CAP);
    await CardArt.preloadArt(batch.map(CardArt.artIdOf));
    if (token !== cardGalleryToken) return;
    grid.append(...batch.map(cardTile));
    shown += batch.length;
    if (shown >= list.length) more.remove(); else more.textContent = 'Show more (' + (list.length - shown) + ' remaining)';
  };
  more.addEventListener('click', renderMore);

  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Card Gallery'), h('p', { class: 'muted' }, 'Search rules text and combine filters across the complete Battlecards library.')),
      h('div', { class: 'result-count' }, list.length.toLocaleString(), h('span', null, ' of ' + cards.length.toLocaleString() + ' cards'))),
    panel,
    ...(chips.length ? [h('div', { class: 'active-filters' }, ...chips)] : []),
    list.length ? grid : empty,
    ...(list.length ? [more] : [])
  );
  if (list.length) renderMore();
}

// Audit-backed queue of cards whose full artwork still needs to be sourced.
async function missingArtView() {
  content.replaceChildren(h('h1', null, 'Cards Missing Art'), h('p', { class: 'muted' }, 'Loading the latest artwork audit…'));
  let cards, report, placeholders;
  try {
    // The audit report is best-effort — when every card is in index.json it can be
    // absent/empty, so a failed load must not blank the whole view. The placeholder
    // list (stand-in art that still wants its own) is the other half of the queue.
    [cards, report, placeholders] = await Promise.all([
      loadCards(),
      loadArtAudit().catch(() => ({})),
      loadCardart().then(() => loadArtPlaceholders()),
    ]);
  } catch (e) {
    return content.replaceChildren(h('h1', null, 'Cards Missing Art'), h('p', { class: 'muted' }, 'Could not load the card data.'));
  }
  if ((location.hash.slice(1).split('/').filter(Boolean))[0] !== 'missing-art') return;

  const unresolved = [...(report.wikiNotFound || []), ...(report.errors || [])];
  const placeholderIds = new Set((placeholders || []).map(p => (typeof p === 'string' ? p : p.id)).filter(Boolean));
  const ids = new Set([...unresolved.map(x => x.id).filter(Boolean), ...placeholderIds]);
  const cardsById = new Map(cards.map(c => [c.id, c]));
  const q = norm(searchEl.value);
  const list = [...ids].map(id => cardsById.get(id)).filter(Boolean)
    .filter(c => !q || norm(c.name).includes(q) || norm(c.id).includes(q) || norm(c.cardClass).includes(q) || norm(c.type).includes(q))
    .sort((a, b) => canonClass(a).localeCompare(canonClass(b)) || String(a.name).localeCompare(String(b.name)));

  await CardArt.preloadArt(list.map(CardArt.artIdOf));
  const temporary = new Set((report.errors || []).map(x => x.id)).size;
  const placeholderShown = list.filter(c => placeholderIds.has(c.id)).length;
  content.replaceChildren(
    h('h1', null, 'Cards Missing Art ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'Cards without their own sourced full-art image in the latest audit of ' + (report.cardCount || cards.length) + ' cards. Click a card to inspect its wiki page.'),
    ...(placeholderShown ? [h('p', { class: 'muted' }, placeholderShown + ' of these use a reused stand-in image and still want their own authentic artwork.')] : []),
    ...(temporary ? [h('p', { class: 'muted' }, temporary + ' card' + (temporary === 1 ? '' : 's') + ' could not be checked during the last audit and will be retried automatically.')] : []),
    list.length
      ? h('div', { class: 'card-grid' }, list.map(cardTile))
      : h('p', null, 'Every card currently has sourced artwork.')
  );
}

// tile = the in-game face snapshotted to an <img> (lighter than keeping live canvases)
function cardTile(c) {
  const canvas = CardArt.drawCardFace(c);
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: c.name, loading: 'lazy' });
  return h('a', { class: 'wiki-card', href: '#/cards/' + c.id + cardQuerySuffix(), title: c.name }, img);
}
// a single card's own page: full in-game face + its details
async function cardDetail(id) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading card…'));
  let cards;
  try { [cards] = await Promise.all([loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Card'), h('p', { class: 'muted' }, 'Could not load the card data.')); }
  const c = cards.find(x => x.id === id);
  if (!c) return content.replaceChildren(h('h1', null, 'Card not found'), h('p', null, h('a', { href: '#/cards' + cardQuerySuffix() }, '← Back to filtered gallery')));
  // generated-card relations: what this card creates, and what creates it.
  // Resolved BEFORE preloading so the related faces get their real art too.
  const byId = {}; for (const x of cards) byId[x.id] = x;
  const generates = CardArt.generatedCardIds(c, byId);
  const createdBy = CardArt.createdByIds(c.id, byId);
  // preload the art each face will actually draw — a generated copy wears its
  // creator's illustration (artFrom), so preloading its own id would warm nothing
  await CardArt.preloadArt([c, ...generates.map(g => byId[g]), ...createdBy.map(g => byId[g])]
    .filter(Boolean).map(CardArt.artIdOf));
  const face = CardArt.drawCardFace(c); face.className = 'wiki-face-big';
  const stats = ['Cost ' + (c.cost ?? 0)];
  if (c.type === 'creature') stats.push((c.attack ?? '?') + ' / ' + (c.health ?? '?'));
  else if (c.type === 'weapon') stats.push(c.attack + ' attack · ' + c.durability + ' durability');
  else if (c.type === 'location') stats.push((c.durability ?? 0) + ' uses');
  else if (c.type === 'planeswalker') stats.push((c.loyalty ?? 0) + ' loyalty');
  const kws = CardKw.keywordsFor(c);
  const artCanvas = CardArt.drawArt(c); artCanvas.className = 'wiki-art-solo';
  // related cards are SHOWN, not just named: a generated token is usually
  // uncollectible, so its face is the only place its rules are readable
  const relGrid = ids => h('div', { class: 'card-grid size-small rel-grid' }, ids.map(gid => cardTile(byId[gid])));
  const metaBucket = systemBucket(c);
  const metaSystem = SYSTEM_BUCKETS.find(([key]) => key === metaBucket);
  const metaClassValue = metaSystem ? metaSystem[0] : canonClass(c);
  const metaClassLabel = metaSystem ? metaSystem[1] : CardArt.classNameOf(c.cardClass);
  const colorMeta = displayColorsOf(c).filter(code => COLOR_NAMES[code]).map((code, i) =>
    [i ? ' / ' : ' · ', h('a', { title: colorName(code), href: c.type === 'land' ? '#/cards?class=__land__' : '#/cards?color=' + encodeURIComponent(code) }, manaSym(code, 13), ' ', colorName(code))]).flat();
  content.replaceChildren(
    h('div', { class: 'card-page' },
      h('div', { class: 'card-page-face' }, face),
      h('div', { class: 'card-page-info' },
        h('h1', null, c.name),
        h('div', { class: 'card-page-meta' },
          h('a', { href: '#/cards?class=' + encodeURIComponent(metaClassValue) }, metaClassLabel),
          colorMeta,
          CardArt.showsRarity(c) ? [' · ', h('a', { href: '#/cards?rarity=' + encodeURIComponent(String(c.rarity || 'common')) }, titleCase(c.rarity || 'common'))] : null),
        // clickable type + tribe/school tags
        h('div', { class: 'card-tags' }, cardTypeChip(c.type), tribesOf(c).map(t => tribeChip(c, t))),
        h('div', { class: 'card-page-stats' }, stats.join('  ·  ')),
        CardKw.runeCount(c.runes) ? h('div', { class: 'card-page-runes', style: 'margin:6px 0;', html: CardKw.runePipsHtml(c.runes) + '<span style="opacity:0.7;font-size:12.5px;vertical-align:2px;">Runes required</span>' }) : null,
        c.description ? h('div', { class: 'card-page-rules', html: CardKw.richHtml(c.description) }) : h('div', { class: 'card-page-rules muted' }, 'No rules text.'),
        // definition of every keyword on the card, each linking to its own page
        kws.length ? h('h2', null, 'Keywords') : null,
        kws.length ? h('div', { class: 'kw-defs' }, kws.map(k =>
          h('div', { class: 'kw-def' }, kwChip(k.label), h('span', { class: 'kw-text' }, k.text)))) : null,
        // every specific card this one generates (tokens, corrupted forms,
        // appendages, equipped weapons, shuffled cards, ...), each a link
        generates.length ? h('h2', null, generates.length === 1 ? 'Generates this card' : 'Generates these cards') : null,
        generates.length ? relGrid(generates) : null,
        // and the reverse: which cards create THIS one
        createdBy.length ? h('h2', null, createdBy.length === 1 ? 'Created by this card' : 'Created by these cards') : null,
        createdBy.length ? relGrid(createdBy) : null)),
    // the card's illustration on its own, no frame
    h('div', { class: 'card-art-section' }, h('h2', null, 'Art'), artCanvas),
    ownerTodoBox(c),
    h('p', null, h('a', { href: '#/cards' + cardQuerySuffix() }, '← Back to filtered gallery')));
}

// ---------- owner-only "New Version" note box ----------
// Shows on every card page for the mgibbie account only: a note filed here
// lands in the server's owner to-do inbox (a dev session later reads it with
// "check the internal to do list" and applies the card change). The server
// re-verifies the account on submit — the cached-login check is just for show.
function ownerTodoBox(card) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null'); } catch (e) { /* no login */ }
  if (cached?.username !== 'mgibbie') return null;
  const ta = h('textarea', {
    class: 'todo-text', rows: '4', maxlength: '2000',
    placeholder: 'Describe the new version of ' + card.name + ' — stat changes, new text, rework…',
  });
  const msg = h('span', { class: 'muted', style: 'margin-left:10px;' });
  const btn = h('button', { class: 'todo-submit' }, 'File for next version');
  btn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) { msg.textContent = 'write the note first'; return; }
    btn.disabled = true;
    msg.textContent = 'filing…';
    try {
      const MP = await import('/battlecards/mpmode.js');
      const r = await MP.call('todo-add', { cardId: card.id, cardName: card.name, text });
      ta.value = '';
      msg.textContent = `filed ✓ (${r.count} note${r.count === 1 ? '' : 's'} in the inbox)`;
    } catch (e) {
      msg.textContent = 'failed: ' + String(e.message || e).slice(0, 60);
    }
    btn.disabled = false;
  });
  return h('div', { class: 'owner-todo' },
    h('h2', null, 'New Version', h('span', { class: 'muted', style: 'font-size:12px;margin-left:8px;' }, 'owner only — files to the internal to-do list')),
    ta,
    h('div', { style: 'margin-top:8px;display:flex;align-items:center;' }, btn, msg));
}

// a filtered subset of cards (by keyword / tribe / type), rendered as faces
async function cardSubsetView(kind, slug) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  let cards;
  try { [cards] = await Promise.all([loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Cards'), h('p', { class: 'muted' }, 'Could not load the card data.')); }
  let title, blurb = null, list;
  if (kind === 'type') {
    list = cards.filter(c => norm(c.type) === slug);
    title = titleCase(slug) + ' cards';
  } else if (kind === 'tribe') {
    // creature (non-spell) tribes only, so a shared word like "Fire" stays separate
    list = cards.filter(c => !SPELL_TYPES.has(c.type) && tribesOf(c).some(t => norm(t) === slug));
    const orig = list.length ? tribesOf(list[0]).find(t => norm(t) === slug) : null;
    title = orig || titleCase(slug);
  } else if (kind === 'school') {
    list = cards.filter(c => SPELL_TYPES.has(c.type) && tribesOf(c).some(t => norm(t) === slug));
    const orig = list.length ? tribesOf(list[0]).find(t => norm(t) === slug) : null;
    title = (orig || titleCase(slug)) + ' spells';
  } else { // keyword
    const e = keywordIndex(cards).get(slug);
    if (!e) return content.replaceChildren(h('h1', null, 'Unknown keyword'), h('p', null, h('a', { href: '#/cards' + cardQuerySuffix() }, '← Back to filtered gallery')));
    list = e.cards; title = e.label; blurb = e.text;
  }
  list = list.slice().sort((a, b) => (a.cost || 0) - (b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  const grid = h('div', { class: 'card-grid' });
  const CAP = 48; let shown = 0;
  const more = h('button', { class: 'showmore' });
  const renderMore = async () => {
    const batch = list.slice(shown, shown + CAP);
    await CardArt.preloadArt(batch.map(CardArt.artIdOf));
    grid.append(...batch.map(cardTile));
    shown += batch.length;
    if (shown >= list.length) more.remove(); else more.textContent = 'Show more (' + (list.length - shown) + ' hidden)';
  };
  more.addEventListener('click', renderMore);
  content.replaceChildren(
    h('h1', null, title + ' ', h('span', { class: 'num' }, '(' + list.length + ')')),
    blurb ? h('p', { class: 'muted' }, blurb) : null,
    h('p', null, h('a', { href: '#/cards' + cardQuerySuffix() }, '← Back to filtered gallery')),
    cardSizeControl(grid), // S/M/L picker (also applies the default size-medium column template)
    grid, more);
  renderMore();
}

// ---------- Contraptions (Sprocket / Assemble) ----------
let contraptionSize = 'small';
async function contraptionsView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  let cards;
  try { [cards] = await Promise.all([loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Contraptions'), h('p', { class: 'muted' }, 'Could not load the card data.')); }
  const list = cards.filter(c => c.contraption).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  await CardArt.preloadArt(list.map(CardArt.artIdOf));
  const sizeBtn = sz => h('button', {
    style: 'padding:4px 12px;border-radius:8px;cursor:pointer;font-size:13px;border:1px solid #4a3f6b;'
      + (contraptionSize === sz ? 'background:#6a5f8a;color:#fff;font-weight:700;' : 'background:#241b38;color:#c9b8ff;'),
    onclick: () => { contraptionSize = sz; contraptionsView(); }
  }, titleCase(sz));
  content.replaceChildren(
    h('h1', null, 'Contraptions ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'Gadgets loaded into your Sprocket — a row of 3 slots. The ',
      h('a', { href: '#/keyword/assemble' }, 'Assemble'),
      ' keyword hands you a random Contraption to place in a slot of your choice (overwriting whatever’s there). An indicator cycles 1 → 2 → 3 each of your turns, firing the Contraption in the slot it lands on — so each one re-fires every time the indicator comes back around.'),
    h('div', { style: 'display:flex;gap:6px;align-items:center;margin:0 0 12px;' },
      h('span', { class: 'muted', style: 'font-size:13px;margin-right:2px;' }, 'Card size:'), sizeBtn('small'), sizeBtn('medium')),
    h('div', { class: 'card-grid size-' + contraptionSize }, list.map(cardTile)));
}

// ---------- Advance Dungeons (the dungeons the Advance keyword ventures) ----------
let advDungeonPromise = null;
function loadAdvDungeons() { if (!advDungeonPromise) advDungeonPromise = import('../battlecards/engine/dungeons.js' + CB); return advDungeonPromise; }
let dungeonSize = 'medium';
const DUNGEON_WIDTHS = { small: 260, medium: 380 };
async function dungeonsView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading dungeons…'));
  let cards, mod;
  try { [cards] = await Promise.all([loadCards(), loadCardart()]); mod = await loadAdvDungeons(); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Advance Dungeons'), h('p', { class: 'muted' }, 'Could not load the dungeon data.')); }
  const DUNGEONS = mod.DUNGEONS || {};
  const dcards = cards.filter(c => c.type === 'dungeon');
  const faceW = DUNGEON_WIDTHS[dungeonSize] || 380;
  const sizeBtn = sz => h('button', {
    style: 'padding:4px 12px;border-radius:8px;cursor:pointer;font-size:13px;border:1px solid #4a3f6b;'
      + (dungeonSize === sz ? 'background:#6a5f8a;color:#fff;font-weight:700;' : 'background:#241b38;color:#c9b8ff;'),
    onclick: () => { dungeonSize = sz; dungeonsView(); }
  }, titleCase(sz));
  const sections = dcards.map(card => {
    const d = DUNGEONS[card.id];
    const face = CardArt.drawCardFace(card, { dungeons: DUNGEONS }); // pass fresh (cache-busted) dungeon data
    Object.assign(face.style, { width: faceW + 'px', maxWidth: '100%', height: 'auto', borderRadius: '16px', boxShadow: '0 6px 22px rgba(0,0,0,0.5)' });
    const rooms = d ? Object.entries(d.rooms).map(([rid, r]) => {
      const nexts = (r.next || []).map(nid => (d.rooms[nid] && d.rooms[nid].name) || nid);
      return h('div', { class: 'kw-def' },
        h('b', null, r.name + (rid === d.start ? ' — start' : '')),
        h('div', { class: 'kw-text' }, r.text || ''),
        h('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;' }, nexts.length ? '→ ' + nexts.join('  /  ') : '★ final room (payoff)'));
    }) : [];
    return h('div', { style: 'display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;margin:0 0 30px;' },
      face,
      h('div', { style: 'flex:1;min-width:260px;' },
        h('h2', null, card.name + ' ', h('span', { class: 'num' }, '(' + (d ? Object.keys(d.rooms).length : 0) + ' rooms)')),
        h('div', { class: 'kw-defs' }, rooms)));
  });
  content.replaceChildren(
    h('h1', null, 'Advance Dungeons ', h('span', { class: 'num' }, '(' + dcards.length + ')')),
    h('p', { class: 'muted' }, 'The ', h('a', { href: '#/keyword/advance' }, 'Advance'),
      ' keyword ventures into a dungeon: you pick one to enter, then each Advance moves to the next room (branching rooms are a choice), triggering its effect. Reach the final room for the payoff. Each dungeon is a no-cost Dungeon card showing the full room flowchart.'),
    h('div', { style: 'display:flex;gap:6px;align-items:center;margin:0 0 16px;' },
      h('span', { class: 'muted', style: 'font-size:13px;margin-right:2px;' }, 'Card size:'), sizeBtn('small'), sizeBtn('medium')),
    ...sections);
}

// ---------- Dungeon Run ----------
// a hero-power blurb block shared by boss and starter-deck pages
function powerBlock(power) {
  if (!power) return h('p', { class: 'muted' }, 'No hero power.');
  return h('div', { class: 'kw-def' },
    h('span', { class: 'tag-chip type' }, `${power.name} (${power.cost ?? 0})`),
    h('span', { class: 'kw-text' }, power.text || ''));
}
// a decklist rendered as in-game faces; duplicate ids collapse to one tile
// with a ×N badge. Unknown ids (not in cards.json) degrade to a text chip.
async function deckGrid(ids, byId) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const uniq = [...counts.keys()].map(id => byId[id] || null);
  await CardArt.preloadArt(uniq.filter(Boolean).map(CardArt.artIdOf));
  const grid = h('div', { class: 'card-grid' });
  const entries = [...counts.entries()]
    .sort((a, b) => ((byId[a[0]]?.cost || 0) - (byId[b[0]]?.cost || 0)) || a[0].localeCompare(b[0]));
  for (const [id, n] of entries) {
    const c = byId[id];
    if (!c) { grid.append(h('span', { class: 'chip' }, id + (n > 1 ? ` ×${n}` : ''))); continue; }
    const tile = cardTile(c);
    if (n > 1) tile.append(h('span', {
      class: 'num',
      style: 'position:absolute;right:4px;bottom:4px;background:rgba(10,8,20,0.85);border-radius:6px;padding:1px 6px;font-weight:bold;',
    }, '×' + n));
    tile.style.position = 'relative';
    grid.append(tile);
  }
  return grid;
}
// overview: every starter deck, and the boss ladder grouped into its
// level pools (which pool = when in the run you can encounter the boss)
async function dungeonView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading dungeon…'));
  let D, classes;
  try { [D, classes] = await Promise.all([loadDungeon(), loadClasses()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Dungeon Run'), h('p', { class: 'muted' }, 'Could not load the dungeon data.')); }
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase(id);
  const deckLinks = Object.keys(D.STARTER_DECKS).map(id =>
    h('a', { class: 'tag-chip type', href: '#/dungeon/deck/' + id }, clsName(id)));
  const byLevel = new Map();
  for (const [bid, b] of Object.entries(D.BOSSES)) {
    if (!byLevel.has(b.level)) byLevel.set(b.level, []);
    byLevel.get(b.level).push([bid, b]);
  }
  const pools = [...byLevel.keys()].sort((a, b) => a - b).map(lv => {
    const bosses = byLevel.get(lv);
    return h('div', null,
      h('h2', null, `Level ${lv} pool `, h('span', { class: 'num' }, `(${bosses[0][1].health} HP)`)),
      h('div', { class: 'kw-defs' }, bosses.map(([bid, b]) =>
        h('div', { class: 'kw-def' },
          h('a', { class: 'tag-chip tribe', href: '#/dungeon/boss/' + bid }, b.name),
          h('span', { class: 'kw-text' }, b.flavor || '')))));
  });
  content.replaceChildren(
    h('h1', null, 'Dungeon Run'),
    h('p', { class: 'muted' }, 'Pick a class, fight the eight-boss ladder, draft as you go. One of each pool\'s bosses is rolled per run — a boss\'s pool is when you can meet it.'),
    h('h2', null, 'Starter Decks ', h('span', { class: 'num' }, `(${deckLinks.length})`)),
    h('div', { class: 'card-tags' }, deckLinks),
    ...pools);
}
// one class's starting deck: the class hero power + its 10 cards
async function dungeonDeckView(classId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading deck…'));
  let D, classes, cards;
  try { [D, classes, cards] = await Promise.all([loadDungeon(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Starter Deck'), h('p', { class: 'muted' }, 'Could not load the dungeon data.')); }
  const ids = D.STARTER_DECKS[classId];
  if (!ids) return content.replaceChildren(h('h1', null, 'Unknown class'), h('p', null, h('a', { href: '#/dungeon' }, '← Dungeon Run')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const cls = classes.find(c => c.id === classId);
  content.replaceChildren(
    h('h1', null, (cls?.name || titleCase(classId)) + ' Starter Deck'),
    h('p', null, h('a', { href: '#/dungeon' }, '← Dungeon Run')),
    h('h2', null, 'Hero Power'),
    powerBlock(cls?.power),
    h('h2', null, `Deck `, h('span', { class: 'num' }, `(${ids.length} cards)`)),
    await deckGrid(ids, byId));
}
// one boss: pool, health, flavor, hero power, and its full decklist
async function dungeonBossView(bossId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading boss…'));
  let D, cards;
  try { [D, cards] = await Promise.all([loadDungeon(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Boss'), h('p', { class: 'muted' }, 'Could not load the dungeon data.')); }
  const b = D.BOSSES[bossId];
  if (!b) return content.replaceChildren(h('h1', null, 'Unknown boss'), h('p', null, h('a', { href: '#/dungeon' }, '← Dungeon Run')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  // a few bosses have an always-on passive instead of an activated power
  const PASSIVES = {
    'battlecries-twice': 'Battlecries trigger twice.',
    'deathrattles-twice': 'Deathrattles trigger twice.',
    'both-twice': 'Battlecries and Deathrattles trigger twice.',
  };
  content.replaceChildren(
    h('h1', null, b.name),
    h('div', { class: 'card-page-meta' }, `Level ${b.level} pool · ${b.health} HP`),
    b.flavor ? h('p', { class: 'muted' }, b.flavor) : null,
    h('p', null, h('a', { href: '#/dungeon' }, '← Dungeon Run')),
    h('h2', null, b.passive ? 'Passive' : 'Hero Power'),
    b.passive
      ? h('div', { class: 'kw-def' }, h('span', { class: 'tag-chip school' }, 'Passive'),
          h('span', { class: 'kw-text' }, PASSIVES[b.passive] || titleCase(b.passive)))
      : powerBlock(b.power),
    h('h2', null, 'Decklist ', h('span', { class: 'num' }, `(${(b.deck || []).length} cards)`)),
    await deckGrid(b.deck || [], byId));
}

// ---------- Dalaran Heist ----------
// a round portrait for a heist hero/boss (art id = heist_<id>), or a
// lettered placeholder when the image is missing
function heistPortrait(id, size = 96) {
  const img = h('img', {
    src: '../battlecards/art/heist_' + id + '.jpg' + CB, alt: id,
    style: `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid #5a4f7a;`,
    onerror: e => e.target.remove(),
  });
  return img;
}
// overview: the nine heroes, then the five wings with their boss rosters
async function heistView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading heist…'));
  let H, classes;
  try { [H, classes] = await Promise.all([loadHeist(), loadClasses()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Dalaran Heist'), h('p', { class: 'muted' }, 'Could not load the heist data.')); }
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase(id);
  const heroCards = H.HEROES.map(hero => h('a', {
    class: 'wiki-card', href: '#/heist/hero/' + hero.id, title: hero.flavor,
    style: 'display:flex;flex-direction:column;align-items:center;gap:6px;width:120px;text-decoration:none;',
  },
    heistPortrait(hero.id, 88),
    h('div', { style: 'font-weight:bold;text-align:center;font-size:13px;' }, hero.name),
    h('div', { class: 'muted', style: 'font-size:11.5px;' }, clsName(hero.heroClass))));
  const wings = H.WINGS.map(w => h('div', null,
    h('h2', null, w.name, ' ', h('span', { class: 'num' }, `(final: ${H.BOSSES[w.final].name})`)),
    h('div', { class: 'card-tags' },
      [...w.pool, w.final].map(bid => h('a', {
        class: 'tag-chip ' + (bid === w.final ? 'school' : 'tribe'), href: '#/heist/boss/' + bid,
      }, H.BOSSES[bid].name + ` · ${H.BOSSES[bid].health}`)))));
  content.replaceChildren(
    h('h1', null, 'Dalaran Heist'),
    h('p', { class: 'muted' }, 'Pick a hero and a hero power, then rob one of five chapters — an eight-boss climb with card drafts, passive boons, and active treasures between fights. Your life scales as you go deeper; the final boss of each wing is fixed.'),
    h('p', null, h('a', { href: '#/heist/treasures' }, 'Treasures & passives →')),
    h('h2', null, 'Heroes ', h('span', { class: 'num' }, `(${H.HEROES.length})`)),
    h('div', { class: 'card-grid', style: 'gap:14px;' }, ...heroCards),
    h('h2', null, 'The Wings'),
    ...wings);
}
// one hero: portrait, class, its three hero-power options, and starter deck
async function heistHeroView(heroId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading hero…'));
  let H, D, classes, cards;
  try { [H, D, classes, cards] = await Promise.all([loadHeist(), loadDungeon(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Hero'), h('p', { class: 'muted' }, 'Could not load the heist data.')); }
  const hero = H.HEROES.find(x => x.id === heroId);
  if (!hero) return content.replaceChildren(h('h1', null, 'Unknown hero'), h('p', null, h('a', { href: '#/heist' }, '← Dalaran Heist')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const cls = classes.find(c => c.id === hero.heroClass);
  // the three hero-power options: class default + the two dala_ alternates
  const alts = cards.filter(c => c.set === 'DALARAN_HEIST' && c.type === 'heropower' && c.cardClass === hero.heroClass);
  const powers = [cls?.power ? { name: cls.power.name, cost: cls.power.cost, text: cls.power.text } : null,
    ...alts.map(c => ({ name: c.name, cost: c.power.cost, text: (c.description || '').replace(/^Hero Power \(\d+\): /, '') }))].filter(Boolean);
  const deckIds = D.STARTER_DECKS[hero.heroClass] || [];
  content.replaceChildren(
    h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;' },
      heistPortrait(hero.id, 110),
      h('div', null, h('h1', { style: 'margin:0;' }, hero.name),
        h('div', { class: 'card-page-meta' }, cls?.name || titleCase(hero.heroClass)),
        h('p', { class: 'muted', style: 'margin:4px 0 0;' }, hero.flavor))),
    h('p', null, h('a', { href: '#/heist' }, '← Dalaran Heist')),
    h('h2', null, 'Hero Powers ', h('span', { class: 'num' }, '(choose one at the start of a run)')),
    h('div', { class: 'kw-defs' }, powers.map(p => powerBlock(p))),
    h('h2', null, 'Starter Deck ', h('span', { class: 'num' }, `(${deckIds.length} cards)`)),
    await deckGrid(deckIds, byId));
}
// one boss: portrait, wing, HP, hero power, and its themed decklist
async function heistBossView(bossId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading boss…'));
  let H, cards;
  try { [H, cards] = await Promise.all([loadHeist(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Boss'), h('p', { class: 'muted' }, 'Could not load the heist data.')); }
  const b = H.BOSSES[bossId];
  if (!b) return content.replaceChildren(h('h1', null, 'Unknown boss'), h('p', null, h('a', { href: '#/heist' }, '← Dalaran Heist')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const wing = H.WINGS.find(w => w.pool.includes(bossId) || w.final === bossId);
  const isFinal = wing && wing.final === bossId;
  const deck = H.buildBossDeck(byId, b.theme);
  content.replaceChildren(
    h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;' },
      heistPortrait(bossId, 110),
      h('div', null, h('h1', { style: 'margin:0;' }, b.name),
        h('div', { class: 'card-page-meta' },
          (wing ? wing.name : 'Heist') + (isFinal ? ' · Final Boss' : '') + ` · ${b.health} HP`))),
    h('p', null, h('a', { href: '#/heist' }, '← Dalaran Heist')),
    h('h2', null, 'Hero Power'),
    powerBlock(b.power),
    h('h2', null, 'Deck ', h('span', { class: 'num' }, `(themed · ${deck.length} cards)`)),
    h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:-4px;' }, 'Built from the boss’s theme at fight time; a representative list is shown.'),
    await deckGrid(deck, byId));
}
// the treasure catalogue: active treasures (cards) + passive boons
async function heistTreasuresView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading treasures…'));
  let H, cards;
  try { [H, cards] = await Promise.all([loadHeist(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Heist Treasures'), h('p', { class: 'muted' }, 'Could not load the heist data.')); }
  const active = cards.filter(c => c.treasure).map(c => c.id);
  const passiveCards = cards.filter(c => c.passive).map(c => c.id);
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const anomalies = Object.entries(H.ANOMALIES || {}).map(([id, a]) => h('div', { class: 'kw-def' },
    h('span', { class: 'tag-chip tribe' }, a.name),
    h('span', { class: 'kw-text' }, a.text)));
  content.replaceChildren(
    h('h1', null, 'Heist Treasures'),
    h('p', null, h('a', { href: '#/heist' }, '← Dalaran Heist')),
    h('h2', null, 'Active Treasures ', h('span', { class: 'num' }, `(${active.length} — one joins your deck after fights 3 & 7)`)),
    await deckGrid(active, byId),
    h('h2', null, 'Passive Treasures ', h('span', { class: 'num' }, `(${passiveCards.length} — one chosen after fights 1 & 5)`)),
    await deckGrid(passiveCards, byId),
    h('h2', null, 'Anomalies ', h('span', { class: 'num' }, `(${anomalies.length} — an optional run-wide twist, chosen at the start)`)),
    h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:-4px;' }, 'A symmetric rule that warps every fight — it hits you and every boss alike.'),
    h('div', { class: 'kw-defs' }, ...anomalies));
}

// ---------- Tombs of Terror ----------
// a round portrait for a tombs explorer/boss (art id = tombs_<id>), or a
// lettered placeholder when the image is missing
function tombsPortrait(id, size = 96) {
  return h('img', {
    src: '../battlecards/art/tombs_' + id + '.jpg' + CB, alt: id,
    style: `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid #7a6a3a;`,
    onerror: e => e.target.remove(),
  });
}
// overview: the four Explorers, then the four chapters with their boss rosters
async function tombsView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading tombs…'));
  let T, classes;
  try { [T, classes] = await Promise.all([loadTombs(), loadClasses()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Tombs of Terror'), h('p', { class: 'muted' }, 'Could not load the tombs data.')); }
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase(id);
  const explorerCards = T.EXPLORERS.map(ex => h('a', {
    class: 'wiki-card', href: '#/tombs/explorer/' + ex.id, title: ex.flavor,
    style: 'display:flex;flex-direction:column;align-items:center;gap:6px;width:120px;text-decoration:none;',
  },
    tombsPortrait(ex.id, 88),
    h('div', { style: 'font-weight:bold;text-align:center;font-size:13px;' }, ex.name),
    h('div', { class: 'muted', style: 'font-size:11.5px;' }, clsName(ex.heroClass))));
  const chapters = T.CHAPTERS.map(c => h('div', null,
    h('h2', null, c.name, ' ', h('span', { class: 'num' }, `(Plague Lord: ${T.BOSSES[c.final].name})`)),
    h('div', { class: 'card-tags' },
      [...c.pool, c.final].map(bid => h('a', {
        class: 'tag-chip ' + (bid === c.final ? 'school' : 'tribe'), href: '#/tombs/boss/' + bid,
      }, T.BOSSES[bid].name + ` · ${T.BOSSES[bid].health}`)))));
  content.replaceChildren(
    h('h1', null, 'Tombs of Terror'),
    h('p', { class: 'muted' }, 'Pick an Explorer and a hero power, then delve one of four chapters — an eight-boss climb with card drafts, passive boons, and active treasures between fights. Your life scales as you go deeper; each chapter ends with a fixed Plague Lord.'),
    h('p', null, h('a', { href: '#/tombs/treasures' }, 'Treasures & passives →')),
    h('h2', null, 'Explorers ', h('span', { class: 'num' }, `(${T.EXPLORERS.length})`)),
    h('div', { class: 'card-grid', style: 'gap:14px;' }, ...explorerCards),
    h('h2', null, 'The Chapters'),
    ...chapters);
}
// one Explorer: portrait, class, its three hero-power options, and starter deck
async function tombsExplorerView(explorerId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading explorer…'));
  let T, D, classes, cards;
  try { [T, D, classes, cards] = await Promise.all([loadTombs(), loadDungeon(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Explorer'), h('p', { class: 'muted' }, 'Could not load the tombs data.')); }
  const ex = T.EXPLORERS.find(x => x.id === explorerId);
  if (!ex) return content.replaceChildren(h('h1', null, 'Unknown explorer'), h('p', null, h('a', { href: '#/tombs' }, '← Tombs of Terror')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const cls = classes.find(c => c.id === ex.heroClass);
  // the three hero-power options: class default + the Explorer's ulda_ alternates
  const alts = (T.EXPLORER_POWERS[ex.heroClass] || []).map(id => byId[id]).filter(c => c && c.power);
  const powers = [cls?.power ? { name: cls.power.name, cost: cls.power.cost, text: cls.power.text } : null,
    ...alts.map(c => ({ name: c.name, cost: c.power.cost, text: (c.description || '').replace(/^Hero Power \(\d+\): /, '') }))].filter(Boolean);
  const deckIds = D.STARTER_DECKS[ex.heroClass] || [];
  content.replaceChildren(
    h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;' },
      tombsPortrait(ex.id, 110),
      h('div', null, h('h1', { style: 'margin:0;' }, ex.name),
        h('div', { class: 'card-page-meta' }, cls?.name || titleCase(ex.heroClass)),
        h('p', { class: 'muted', style: 'margin:4px 0 0;' }, ex.flavor))),
    h('p', null, h('a', { href: '#/tombs' }, '← Tombs of Terror')),
    h('h2', null, 'Hero Powers ', h('span', { class: 'num' }, '(choose one at the start of a run)')),
    h('div', { class: 'kw-defs' }, powers.map(p => powerBlock(p))),
    h('h2', null, 'Starter Deck ', h('span', { class: 'num' }, `(${deckIds.length} cards)`)),
    await deckGrid(deckIds, byId));
}
// one boss: portrait, chapter, HP, hero power, and its themed decklist
async function tombsBossView(bossId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading boss…'));
  let T, cards;
  try { [T, cards] = await Promise.all([loadTombs(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Boss'), h('p', { class: 'muted' }, 'Could not load the tombs data.')); }
  const b = T.BOSSES[bossId];
  if (!b) return content.replaceChildren(h('h1', null, 'Unknown boss'), h('p', null, h('a', { href: '#/tombs' }, '← Tombs of Terror')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const chapter = T.CHAPTERS.find(c => c.pool.includes(bossId) || c.final === bossId);
  const isFinal = chapter && chapter.final === bossId;
  const deck = T.buildBossDeck(byId, b.theme);
  content.replaceChildren(
    h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;' },
      tombsPortrait(bossId, 110),
      h('div', null, h('h1', { style: 'margin:0;' }, b.name),
        h('div', { class: 'card-page-meta' },
          (chapter ? chapter.name : 'Tombs') + (isFinal ? ' · Plague Lord' : '') + ` · ${b.health} HP`))),
    h('p', null, h('a', { href: '#/tombs' }, '← Tombs of Terror')),
    h('h2', null, 'Hero Power'),
    powerBlock(b.power),
    h('h2', null, 'Deck ', h('span', { class: 'num' }, `(themed · ${deck.length} cards)`)),
    h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:-4px;' }, 'Built from the boss’s theme at fight time; a representative list is shown.'),
    await deckGrid(deck, byId));
}
// the treasure catalogue: active treasures (cards) + passive boons
async function tombsTreasuresView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading treasures…'));
  let cards;
  try { [, cards] = await Promise.all([loadTombs(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Tombs Treasures'), h('p', { class: 'muted' }, 'Could not load the tombs data.')); }
  const active = cards.filter(c => c.treasure && c.set === 'TOMBS_OF_TERROR').map(c => c.id);
  const passiveCards = cards.filter(c => c.passive && c.set === 'TOMBS_OF_TERROR').map(c => c.id);
  const byId = {}; for (const c of cards) byId[c.id] = c;
  content.replaceChildren(
    h('h1', null, 'Tombs Treasures'),
    h('p', null, h('a', { href: '#/tombs' }, '← Tombs of Terror')),
    h('h2', null, 'Active Treasures ', h('span', { class: 'num' }, `(${active.length} — one joins your deck after fights 3 & 7)`)),
    await deckGrid(active, byId),
    h('h2', null, 'Passive Treasures ', h('span', { class: 'num' }, `(${passiveCards.length} — one chosen after fights 1 & 5)`)),
    await deckGrid(passiveCards, byId));
}

// ---------- Duels ----------
// a round portrait for a duels hero/boss (art id = duels_<id>), or nothing
// when the image is missing
function duelsPortrait(id, size = 96) {
  return h('img', {
    src: '../battlecards/art/duels_' + id + '.jpg' + CB, alt: id,
    style: `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid #7a6a3a;`,
    onerror: e => e.target.remove(),
  });
}
// overview: the eleven heroes, then the two rounds with their boss rosters
async function duelsView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading duels...'));
  let Du, classes;
  try { [Du, classes] = await Promise.all([loadDuels(), loadClasses()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Duels'), h('p', { class: 'muted' }, 'Could not load the duels data.')); }
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase(id);
  const heroCards = Du.HEROES.map(hero => h('a', {
    class: 'wiki-card', href: '#/duels/hero/' + hero.id, title: hero.flavor,
    style: 'display:flex;flex-direction:column;align-items:center;gap:6px;width:120px;text-decoration:none;',
  },
    duelsPortrait(hero.id, 88),
    h('div', { style: 'font-weight:bold;text-align:center;font-size:13px;' }, hero.name),
    h('div', { class: 'muted', style: 'font-size:11.5px;' }, Du.classChoicesOf(hero)
      ? `choose 1 of ${Du.classChoicesOf(hero).length} classes`
      : Du.classesOf(hero).map(clsName).join(' / '))));
  const bucketChips = (Du.DUELS_BUCKETS || []).map(b => h('span', { class: 'tag-chip type' }, b.name));
  const rivalChips = (Du.RIVALS || []).map(r => h('span', { class: 'tag-chip tribe' }, r.name + ' · ' + Du.classesOf(r).map(clsName).join(' / ')));
  content.replaceChildren(
    h('h1', null, 'Duels'),
    h('p', { class: 'muted' }, 'Pick a hero and a hero power, then draft a 10-card deck arena-style — ten times you pick one card of three, from your class + Neutral pool (rarity-weighted, so Legendaries are rare). Then play on until 12 wins or 3 losses. After every game you add a loot bucket (3 cards), plus a passive treasure at games 1/5/9 and an active treasure at 3/7/11. Every opponent is generated at the same power budget you have — a 10-card draft plus the same buckets, passives, and treasures — so the fights stay fair as you climb.'),
    h('p', null, h('a', { href: '#/duels/treasures' }, 'Treasures & passives →')),
    h('h2', null, 'Heroes ', h('span', { class: 'num' }, `(${Du.HEROES.length} — pick one)`)),
    h('div', { class: 'card-grid', style: 'gap:14px;' }, ...heroCards),
    h('h2', null, 'Loot Buckets ', h('span', { class: 'num' }, `(${(Du.DUELS_BUCKETS || []).length} — each rolls 3 matching cards)`)),
    h('div', { class: 'card-tags' }, ...bucketChips),
    h('h2', null, 'Rivals ', h('span', { class: 'num' }, '(the identities generated opponents wear)')),
    h('div', { class: 'card-tags' }, ...rivalChips));
}
// one hero: portrait, class, its hero-power options, and how its deck is drafted
async function duelsHeroView(heroId) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading hero...'));
  let Du, classes, cards;
  try { [Du, classes, cards] = await Promise.all([loadDuels(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Hero'), h('p', { class: 'muted' }, 'Could not load the duels data.')); }
  const hero = Du.HEROES.find(x => x.id === heroId);
  if (!hero) return content.replaceChildren(h('h1', null, 'Unknown hero'), h('p', null, h('a', { href: '#/duels' }, '← Duels')));
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase(id);
  // Drek'Thar / Vanndar: a choose-your-class hero — show the five class choices
  const choices = Du.classChoicesOf(hero);
  if (choices) {
    return content.replaceChildren(
      h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;' },
        duelsPortrait(hero.id, 110),
        h('div', null, h('h1', { style: 'margin:0;' }, hero.name),
          h('div', { class: 'card-page-meta' }, `choose-your-class · ${choices.length} classes`),
          h('p', { class: 'muted', style: 'margin:4px 0 0;' }, hero.flavor))),
      h('p', null, h('a', { href: '#/duels' }, '← Duels')),
      h('h2', null, 'Choose Your Class ', h('span', { class: 'num' }, '(pick one at the start of a run)')),
      h('p', { class: 'muted' }, `${hero.name} is a choose-your-class hero: at the start of a run you pick one of these classes, then play as a normal single-class hero of that class — its hero powers, its class + Neutral draft pool, and its signature loot buckets.`),
      h('div', { class: 'card-tags' }, ...choices.map(id => h('span', { class: 'tag-chip tribe' }, clsName(id)))));
  }
  const heroClasses = Du.classesOf(hero);
  const clsLabel = heroClasses.map(id => clsName(id)).join(' / ');
  const primaryCls = classes.find(c => c.id === heroClasses[0]);
  // mirror the game's picker: primary class default power + every class's alt powers (deduped)
  const seen = new Set();
  const altCards = heroClasses.flatMap(cl => (Du.HERO_POWERS[cl] || [])).map(id => byId[id])
    .filter(c => c && c.power && !seen.has(c.id) && seen.add(c.id));
  // a signature-kit hero (Darius Crowley) picks among its own powers only
  const kitCards = (hero.powerIds || []).map(id => byId[id]).filter(c => c && c.power);
  const powers = kitCards.length
    ? kitCards.map(c => ({ name: c.name, cost: c.power.cost, text: (c.description || '').replace(/^Hero Power \(\d+\): /, '') }))
    : [primaryCls?.power ? { name: primaryCls.power.name, cost: primaryCls.power.cost, text: primaryCls.power.text } : null,
      ...altCards.map(c => ({ name: c.name, cost: c.power.cost, text: (c.description || '').replace(/^Hero Power \(\d+\): /, '') }))].filter(Boolean);
  const poolSize = (typeof Du.draftPool === 'function') ? Du.draftPool(byId, heroClasses).length : 0;
  const isDual = heroClasses.length > 1;
  const sigCount = (typeof Du.bucketsFor === 'function') ? Du.bucketsFor(heroClasses).length - (Du.DUELS_BUCKETS || []).length : 0;
  content.replaceChildren(
    h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;' },
      duelsPortrait(hero.id, 110),
      h('div', null, h('h1', { style: 'margin:0;' }, hero.name),
        h('div', { class: 'card-page-meta' }, clsLabel + (isDual ? ' · dual-class' : '')),
        h('p', { class: 'muted', style: 'margin:4px 0 0;' }, hero.flavor))),
    h('p', null, h('a', { href: '#/duels' }, '← Duels')),
    h('h2', null, 'Hero Powers ', h('span', { class: 'num' }, '(choose one at the start of a run)')),
    h('div', { class: 'kw-defs' }, powers.map(p => powerBlock(p))),
    h('h2', null, 'Deck ', h('span', { class: 'num' }, '(10-card arena draft)')),
    h('p', { class: 'muted' }, `No fixed starter deck — you draft ten cards, one of three each pick, from this hero's ${poolSize}-card ${clsLabel} + Neutral pool. Loot buckets and treasures grow it from there.`
      + (isDual ? ` As a dual-class hero, ${hero.name} draws cards, hero powers, and signature loot buckets from both classes.` : '')
      + (sigCount > 0 ? ` Loot rolls include ${sigCount} ${clsLabel} signature buckets on top of the shared themes.` : '')));
}
// the treasure catalogue: active treasures (cards) + passive boons (data-only)
async function duelsTreasuresView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading treasures...'));
  let Du, cards;
  try { [Du, cards] = await Promise.all([loadDuels(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Duels Treasures'), h('p', { class: 'muted' }, 'Could not load the duels data.')); }
  const active = cards.filter(c => c.treasure && c.set === 'DUELS').map(c => c.id);
  const byId = {}; for (const c of cards) byId[c.id] = c;
  const passiveKeys = Object.keys(Du.PASSIVES);
  const passiveBlocks = passiveKeys.map(k => h('div', { class: 'kw-def' },
    h('span', { class: 'tag-chip type' }, Du.PASSIVES[k].name),
    h('span', { class: 'kw-text' }, Du.PASSIVES[k].text)));
  content.replaceChildren(
    h('h1', null, 'Duels Treasures'),
    h('p', null, h('a', { href: '#/duels' }, '← Duels')),
    h('h2', null, 'Active Treasures ', h('span', { class: 'num' }, `(${active.length} - one joins your deck after fights 3, 7 & 11)`)),
    await deckGrid(active, byId),
    h('h2', null, 'Passive Treasures ', h('span', { class: 'num' }, `(${passiveKeys.length} - one chosen after fights 1, 5 & 9)`)),
    h('div', { class: 'kw-defs' }, passiveBlocks));
}

// Battlecards design-work backlog: every card name held without a working
// design, plus undefined keywords. Data from designwiki/data/battlecards.json
// (regenerate with tools/gen_battlecards_design.py — self-contained).
function battlecardsView() {
  const db = DB.battlecards;
  if (!db) return content.replaceChildren(h('h1', null, 'Battlecards data not loaded'));
  const q = norm(searchEl.value);
  const total = db.sections.reduce((a, s) => a + s.count, 0);
  const CAP = 500; // giant sections render a page at a time so mobile survives
  const blocks = db.sections.map(s => {
    const items = q ? s.items.filter(it => norm(it.name).includes(q) || norm(it.note || '').includes(q)) : s.items;
    const det = h('details', { class: 'route', open: q && items.length ? true : null },
      h('summary', null, h('strong', null, s.title + ' '), h('span', { class: 'num' }, '(' + items.length + ')')),
      h('p', { class: 'muted' }, s.blurb));
    let shown = 0;
    const grid = h('div', { class: 'grid' });
    const more = h('button', { class: 'muted', style: 'margin:8px 0;cursor:pointer' });
    const renderMore = () => {
      const next = items.slice(shown, shown + CAP);
      shown += next.length;
      grid.append(...next.map(it =>
        h('a', { class: 'card', href: '#/battlecards/' + norm(it.name) },
          it.art ? h('img', { class: 'design-art', loading: 'lazy', src: '../battlecards/art/' + it.art + '.jpg' }) : null,
          h('div', { class: 'nm' }, it.name),
          it.note ? h('div', { class: 'muted', style: 'font-size:12px' }, it.note) : null)));
      if (shown >= items.length) more.remove();
      else more.textContent = 'Show ' + Math.min(CAP, items.length - shown) + ' more (' + (items.length - shown) + ' hidden)';
    };
    // a section's grid only builds once it's opened
    const build = () => { if (!shown && items.length) { det.append(grid, more); renderMore(); } };
    more.addEventListener('click', e => { e.preventDefault(); renderMore(); });
    det.addEventListener('toggle', () => { if (det.open) build(); });
    if (det.open) build();
    return det;
  });
  content.replaceChildren(
    h('h1', null, 'Battlecards — Design Work ', h('span', { class: 'num' }, '(' + total + ' items)')),
    h('p', { class: 'muted' }, 'Everything named but not yet designed or functional: undefined keywords, pending paper cards, WUBRG cards awaiting redesigns or engine work, the advanced-land theme pools, classes without card lists — plus every unimplemented Hearthstone card across Constructed, solo adventures, Duels, Battlegrounds, and Mercenaries. Search filters every section.'),
    ...blocks);
}

// A single design-work card's page: everything we know about it — every backlog
// section it's listed under (with note + context), plus its real in-game face and
// full card data if it's already implemented in the card pool.
async function designCardDetail(slug) {
  const db = DB.battlecards;
  if (!db) return content.replaceChildren(h('h1', null, 'Battlecards data not loaded'));
  const occ = [];
  let name = slug;
  let designArt = null;
  for (const s of db.sections) for (const it of (s.items || [])) if (norm(it.name) === slug) { occ.push({ section: s.title, blurb: s.blurb, note: it.note }); name = it.name; if (it.art) designArt = it.art; }
  // cross-reference the real card pool (implemented cards) + its face
  let impl = null, art = null;
  try { const [cards, m] = await Promise.all([loadCards(), loadCardart()]); art = m; impl = cards.find(c => norm(c.name) === slug) || null; } catch (e) {}
  if (!occ.length && !impl) return content.replaceChildren(h('h1', null, 'Card not found'), h('p', null, h('a', { href: '#/battlecards' }, '← Design Work')));

  // Notes: one block per backlog section this card appears in
  const notesBody = occ.length ? occ.map(o => h('div', { class: 'route' },
    h('h3', null, o.section),
    o.note ? h('p', null, o.note) : h('p', { class: 'muted' }, 'No note recorded.'),
    o.blurb ? h('p', { class: 'muted', style: 'font-size:12px' }, o.blurb) : null))
    : [h('p', { class: 'muted' }, 'Not in the design backlog.')];

  // implemented-card details + link to its gallery page
  const implBody = [];
  let face = null;
  if (impl && art) {
    try { await art.preloadArt([art.artIdOf(impl)]); face = art.drawCardFace(impl); face.className = 'wiki-face-big'; } catch (e) {}
    const stats = ['Cost ' + (impl.cost ?? 0)];
    if (impl.type === 'creature') stats.push((impl.attack ?? '?') + ' / ' + (impl.health ?? '?'));
    else if (impl.type === 'weapon') stats.push(impl.attack + ' attack · ' + impl.durability + ' durability');
    else if (impl.type === 'location') stats.push((impl.durability ?? 0) + ' uses');
    else if (impl.type === 'planeswalker') stats.push((impl.loyalty ?? 0) + ' loyalty');
    const kws = CardKw.keywordsFor(impl);
    implBody.push(
      h('h2', null, 'Card data'),
      h('div', { class: 'card-page-meta' }, art.classNameOf(impl.cardClass) + (art.showsRarity(impl) ? ' · ' + titleCase(impl.rarity || 'common') : '')),
      h('div', { class: 'card-tags' }, cardTypeChip(impl.type), displayColorsOf(impl).filter(code => COLOR_NAMES[code]).map(code => colorChip(code, impl)), tribesOf(impl).map(t => tribeChip(impl, t))),
      h('div', { class: 'card-page-stats' }, stats.join('  ·  ')),
      impl.description ? h('div', { class: 'card-page-rules', html: CardKw.richHtml(impl.description) }) : h('div', { class: 'card-page-rules muted' }, 'No rules text.'),
      kws.length ? h('h2', null, 'Keywords') : null,
      kws.length ? h('div', { class: 'kw-defs' }, kws.map(k =>
        h('div', { class: 'kw-def' }, kwChip(k.label), h('span', { class: 'kw-text' }, k.text)))) : null,
      h('p', null, h('a', { href: '#/cards/' + impl.id }, 'Open in Card Gallery →')));
  }

  const info = h('div', { class: 'card-page-info' },
    h('h1', null, name),
    h('p', { class: 'card-page-meta' }, impl ? 'Implemented — in the card pool' : 'Design backlog — not yet implemented'),
    h('h2', null, 'Notes'), ...notesBody,
    ...implBody,
    h('p', null, h('a', { href: '#/battlecards' }, '← Design Work')));
  // unbuilt design entries (e.g. plane candidates) carry a standalone art image
  const artEl = (!face && designArt)
    ? h('div', { class: 'card-page-face' }, h('img', { class: 'wiki-art-solo', src: '../battlecards/art/' + designArt + '.jpg' }))
    : null;
  content.replaceChildren((face || artEl)
    ? h('div', { class: 'card-page' }, face ? h('div', { class: 'card-page-face' }, face) : artEl, info)
    : info);
}

// ---------- Micatro (the Balatro clone at /micatro/) ----------
// Data: designwiki/data/micatro.json, generated from the game engine by
// tools/micatro/gen_designwiki.mjs. Sprites are CSS background cells into the
// game's own 2x atlases (../micatro/assets/textures/), never copied.
let micatroPromise = null;
function loadMicatro() {
  if (!micatroPromise) micatroPromise = fetch('data/micatro.json' + CB).then(r => { if (!r.ok) throw new Error('micatro.json ' + r.status); return r.json(); });
  return micatroPromise;
}
const MC_TEX = '../micatro/assets/textures/';
// atlas: [file, width, height, cellW, cellH] at 2x (Balatro's asset_atli px/py × 2)
const MC_ATLAS = {
  Joker: ['Jokers.png', 1420, 3040, 142, 190], Tarot: ['Tarots.png', 1420, 1140, 142, 190],
  Voucher: ['Vouchers.png', 1278, 760, 142, 190], Booster: ['boosters.png', 568, 1710, 142, 190],
  centers: ['Enhancers.png', 994, 950, 142, 190], deck: ['8BitDeck.png', 1846, 760, 142, 190],
  stickers: ['stickers.png', 710, 570, 142, 190], tags: ['tags.png', 408, 340, 68, 68],
  blind: ['BlindChips.png', 1428, 2108, 68, 68], chips: ['chips.png', 290, 116, 58, 58],
};
/** A sprite: layers [[atlas, pos], ...] top-most first, drawn at `scale` (1 = the 2x atlas's own pixels). */
function mcSprite(layers, cls, scale = 1, title) {
  const [, , , cw, ch] = MC_ATLAS[layers[layers.length - 1][0]];
  const img = [], bp = [], bs = [];
  for (const [atlas, pos] of layers) {
    const [file0, aw0, ah0, w, hh, tiled] = MC_ATLAS[atlas];
    if (tiled) {
      // a tiled mod atlas (Pokermon's Unown Swarm strips), as the game's modCellRect: the cell's tile, then only its crop,
      // scaled to fill the card (w x hh)
      const x0 = pos.x || 0, t = Math.floor(x0 / tiled.tile_cols), T = MC_ATLAS['@' + tiled.tiles[t]];
      if (!T) continue;
      const [file, aw, ah] = T, zx = w / tiled.crop.w * scale, zy = hh / tiled.crop.h * scale;
      img.push(`url("${file}")`);
      bp.push(`${-((x0 - t * tiled.tile_cols) * tiled.cell[0] + tiled.crop.x) * zx}px ${-((pos.y || 0) * tiled.cell[1] + tiled.crop.y) * zy}px`);
      bs.push(aw ? `${aw * zx}px ${ah * zy}px` : 'auto');
      continue;
    }
    const file = file0, aw = aw0, ah = ah0;
    img.push(`url("${/^(\/|https?:)/.test(file) ? file : MC_TEX + file}")`); // (a mod atlas: its own absolute src)
    bp.push(`${-(pos.x || 0) * w * scale}px ${-(pos.y || 0) * hh * scale}px`);
    bs.push(aw ? `${aw * scale}px ${ah * scale}px` : `auto`); // (a mod atlas without a known pixel size: natural 2x size)
  }
  return h('div', {
    class: 'mc-spr' + (scale === 1 || scale === 0.5 ? ' mc-px' : '') + (cls ? ' ' + cls : ''), title: title || null, role: 'img', 'aria-label': title || null,
    style: `width:${cw * scale}px;height:${ch * scale}px;background-image:${img.join(',')};background-position:${bp.join(',')};background-size:${bs.join(',')}`,
  });
}
// Balatro text colours (G.C.*), as micatro/js/ui/markup.js uses them; a few darkened for a white page
const MC_COL = {
  mult: '#fe5f55', chips: '#009dff', money: '#d99a22', attention: '#ff8a00', filter: '#ff8a00',
  blue: '#009dff', red: '#fe5f55', green: '#35a97c', tarot: '#a782d1', planet: '#13afce',
  spectral: '#4584fa', legendary: '#b26cbb', enhanced: '#8389dd', purple: '#8867a5', important: '#ff8a00',
  inactive: '#8a95a0', white: '#ffffff', grey: '#5f7377', light_black: '#4f6367', black: '#374244',
  gold: '#c9a238', yellow: '#c9b400', orange: '#fda200', edition: '#4ca893', voucher: '#cb724c',
  booster: '#646eb7', joker_grey: '#8a96a8', eternal: '#c75985', perishable: '#4f5da1', rental: '#b18f43',
  hearts: '#f03464', diamonds: '#f06b3f', spades: '#403995', clubs: '#235955', default: '#4f6367',
  chance: '#35a97c', pale_green: '#56a887', dark_edition: '#5a4fcf', secondary_set: '#4f6367',
};
const MC_BADGE = { Common: '#009dff', Uncommon: '#35a97c', Rare: '#fe5f55', Legendary: '#b26cbb', Tarot: '#a782d1', Planet: '#13afce', Spectral: '#4584fa', Voucher: '#fd682b', Booster: '#646eb7' };
const mcEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** One Balatro markup line -> HTML ("{C:mult}+4{} Mult", "{X:mult,C:white} X2 {}", "{s:0.8}", "{V:1}"). */
function mcMarkup(line, colours) {
  const s = String(line == null ? '' : line);
  let out = '', i = 0, open = false;
  while (i < s.length) {
    const b = s.indexOf('{', i);
    if (b < 0) { out += mcEsc(s.slice(i)); break; }
    out += mcEsc(s.slice(i, b));
    const e = s.indexOf('}', b);
    if (e < 0) { out += mcEsc(s.slice(b)); break; }
    const spec = s.slice(b + 1, e).trim();
    if (open) { out += '</span>'; open = false; }
    if (spec) {
      const st = []; let cls = '';
      for (const part of spec.split(',')) {
        const [k, v0] = part.split(':');
        const v = (v0 || '').trim().toLowerCase();
        if (k === 'C') { if (v === 'dark_edition') cls += ' dark-ed'; else st.push('color:' + (MC_COL[v] || MC_COL.default)); }
        else if (k === 'X') { st.push('background:' + (MC_COL[v] || MC_COL.mult)); cls += ' xbox'; }
        else if (k === 'V') { const c = colours && colours[(parseInt(v, 10) || 1) - 1]; const css = typeof c === 'string' ? MC_COL[c.toLowerCase()] : null; if (css) st.push('color:' + css); }
        else if (k === 's' || k === 'S') { const n = parseFloat(v); if (n && n < 1) st.push('font-size:' + Math.round(n * 100) + '%'); }
      }
      out += `<span class="mk${cls}" style="${st.join(';')}">`;
      open = true;
    }
    i = e + 1;
  }
  if (open) out += '</span>';
  return out;
}
const mcDesc = (lines, colours, cls) => h('div', { class: 'mc-desc' + (cls ? ' ' + cls : ''), html: (lines || []).map(l => mcMarkup(l, colours)).join('<br>') || '<span class="muted">—</span>' });
const mcBadge = (label, col) => h('span', { class: 'mc-badge', style: 'background:' + (col || '#6b7793') }, label);
const mcInfo = info => (info && info.length) ? h('div', { class: 'mc-info' }, info.map(i => h('div', null, h('b', null, i.name), h('div', { html: i.lines.map(l => mcMarkup(l)).join('<br>') })))) : null;
function mcSection(title, sub, ...kids) {
  return h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' }, h('h2', null, title), sub ? h('p', { class: 'muted' }, sub) : null), ...kids);
}
const mcBack = () => h('p', { class: 'lp-back' }, h('a', { href: '#/micatro' }, '← Micatro'));
function mcHead(title, count, unit, blurb) {
  return h('div', { class: 'gallery-heading' },
    h('div', null, h('h1', null, title), blurb ? h('p', { class: 'muted' }, blurb) : null),
    count != null ? h('div', { class: 'result-count' }, count, h('span', null, ' ' + unit)) : null);
}
/** A card tile: sprite (+ layers), name, badges, description. */
function mcTile(layers, it, badges, extra, opts = {}) {
  return h('div', { class: 'mc-tile' + (opts.cls ? ' ' + opts.cls : ''), 'data-key': it.key || it.name, id: 'mc-' + (it.key || '') },
    h('div', { class: 'mc-art' }, mcSprite(layers, opts.sprCls, opts.scale || 1, it.name)),
    h('div', { class: 'mc-nm' }, it.name),
    badges && badges.length ? h('div', { class: 'mc-badges' }, badges) : null,
    mcDesc(it.lines, it.colours),
    mcInfo(it.info), extra || null);
}
const mcCost = c => c != null ? h('span', { class: 'mc-cost' }, '$' + c) : null;
async function mcLoadOr(title) {
  try { return await loadMicatro(); }
  catch (e) { content.replaceChildren(h('h1', null, title), h('p', { class: 'muted' }, 'Could not load the Micatro data.')); return null; }
}
const mcStillOn = sub => { const p = location.hash.slice(1).split('?')[0].split('/').filter(Boolean); return p[0] === 'micatro' && (p[1] || '') === sub; };

async function micatroView() {
  content.replaceChildren(h('h1', null, 'Micatro'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Micatro'); if (!D || !mcStillOn('')) return;
  const table = (head, rows) => h('table', null,
    h('thead', null, h('tr', null, ...head.map(c => h('th', null, c)))),
    h('tbody', null, ...rows.map(r => h('tr', null, ...r.map(c => h('td', null, c)))))) ;
  const kbd = (...k) => k.map((x, i) => [i ? ' / ' : '', h('kbd', null, x)]).flat();
  const idx = [
    // [route, label, count, art layers (top-most first)]
    ['jokers', 'Jokers', D.jokers.length, [['Joker', D.jokers[0].pos]]],
    ['consumables', 'Tarot, Planet & Spectral', D.tarots.length + D.planets.length + D.spectrals.length, [['Tarot', D.tarots[0].pos]]],
    ['vouchers', 'Vouchers', D.vouchers.length, [['Voucher', D.vouchers[0].pos]]],
    ['boosters', 'Booster Packs', D.boosters.length, [['Booster', D.boosters[0].pos]]],
    ['tags', 'Skip Tags', D.tags.length, [['tags', D.tags[0].pos]]],
    ['blinds', 'Blinds', D.blinds.length, [['blind', D.blinds[2].pos]]],
    ['decks', 'Decks', D.decks.length, [['centers', D.decks[0].pos]]],
    ['stakes', 'Stakes', D.stakes.length, [['chips', D.stakes[7].pos]]],
    ['hands', 'Poker Hands', D.hands.length, [['deck', D.cards.S_A], ['centers', D.basePos]]], // (the Royal Flush's Ace)
    ['enhancements', 'Enhancements & Seals', D.enhancements.length + D.editions.length + D.seals.length, [['centers', D.enhancements[0].pos]]],
    // Balatro's Challenge Deck (b_challenge), the back every challenge plays on
    ['challenges', 'Challenges', (D.challenges || []).length, (D.challenges && D.challenges[0] && D.challenges[0].art) || [['centers', { x: 0, y: 4 }]]],
  ];
  content.replaceChildren(
    h('div', { class: 'mc-hero' },
      h('div', null,
        h('h1', null, 'Micatro'),
        h('p', null, 'A faithful clone of ', h('b', null, 'Balatro'), ' — the poker roguelike — rebuilt in plain JavaScript from the original game’s rules, numbers and art. Play poker hands to beat escalating Blinds, then spend your winnings on Jokers that bend the rules.'),
        h('p', null, h('a', { class: 'mc-play', href: '/micatro/' }, '▶ Play Micatro'), ' ', h('span', { class: 'muted' }, 'every deck and stake is open from the start'))),
      h('div', { class: 'mc-hero-art' }, mcSprite([['Joker', D.jokers[0].pos]], null, 1, 'Joker'),
        mcSprite([['Joker', D.jokers.find(j => j.key === 'j_perkeo').soul], ['Joker', D.jokers.find(j => j.key === 'j_perkeo').pos]], null, 1, 'Perkeo'))),
    h('div', { class: 'lp-grid mc-index' }, idx.map(([k, label, n, art]) => h('a', { class: 'lp-tile mc-idx', href: '#/micatro/' + k, 'data-cat': k },
      mcSprite(art, 'mc-idx-spr', ['blind', 'tags', 'chips'].includes(art[art.length - 1][0]) ? 1 : 0.5, label),
      h('span', { class: 'mc-idx-txtwrap' }, h('span', { class: 'lp-name' }, label), h('span', { class: 'lp-count' }, n + ' entries'))))),
    mcSection('Built-in features', 'Extras of the base game, in every run.',
      h('div', { class: 'lp-grid mc-feat' }, [
        ['deck-editor', 'Deck editor', 'Build, share and play your own decks.'],
        ['replays', 'Replays', 'Watch any finished run again, start to finish.'],
        ['big-numbers', 'Big-number scoring', 'Scores past naneinf, up to 9.99e999.'],
      ].map(([k, label, blurb]) => h('a', { class: 'lp-tile mc-featlink', href: '#/micatro/' + k }, h('span', { class: 'lp-name' }, label), h('span', { class: 'lp-count mc-wrap' }, blurb)))),
      h('p', { class: 'mc-crosslink' }, 'Looking for mod content? Pokermon, Bunco, More Fluff and the other rebuilt mods have their own section: ', h('a', { href: '#/micatro-mods' }, 'Micatro Mods →'))),
    mcSection('Getting there', null,
      h('ul', { class: 'mc-list' },
        h('li', null, h('b', null, 'Landing page: '), 'the Micatro tile on ', h('a', { href: '/' }, 'michaelgibalerio.com'), ' opens ', h('a', { href: '/micatro/' }, '/micatro/'), '.'),
        h('li', null, h('b', null, 'Overworld: '), 'the MICATRO arcade cabinet in the ', h('b', null, 'Celadon City Game Corner'), ' (Kanto). Interact with it and answer YES — your party and position are saved, and the game’s back link returns you to the overworld.'),
        h('li', null, h('b', null, 'Watch a friend: '), 'a logged-in player’s run is broadcast live to their friends. When a friend is playing, they show up in the ', h('b', null, 'Live now'), ' hub on the Battlecards start page, the topbar’s ', h('b', null, 'Watch'), ' list, and the overworld friends list (“Playing Micatro — Ante 3”). Watching is read-only (/micatro/?spectate=<name>), up to 10 spectators per run, with chat.'),
        h('li', null, h('b', null, 'Leaderboard: '), 'the main menu’s Leaderboard ranks players by their ', h('b', null, 'best single hand'), ' score in any run (logged-in players only; the run’s ante, deck and stake are shown beside it).'))),
    mcSection('Rules in brief', 'Exactly Balatro’s rules — the details live on the pages above.',
      h('ul', { class: 'mc-list' },
        h('li', null, h('b', null, 'Antes & Blinds. '), 'Each Ante is a ', h('b', null, 'Small Blind'), ', a ', h('b', null, 'Big Blind'), ' and a ', h('a', { href: '#/micatro/blinds' }, 'Boss Blind'), ' with a nasty twist. Score at least the Blind’s chip target before your Hands run out (4 hands, 3 discards and 8 cards in hand by default; the deck and Vouchers change these). Beat the Ante 8 boss to win, then keep going in Endless mode if you like. Skip a Small or Big Blind to take its ', h('a', { href: '#/micatro/tags' }, 'Tag'), ' instead.'),
        h('li', null, h('b', null, 'Chips × Mult. '), 'Play up to 5 cards. The ', h('a', { href: '#/micatro/hands' }, 'poker hand'), ' sets base Chips and Mult; each scoring card adds its rank in Chips (Ace 11, faces 10); then ', h('a', { href: '#/micatro/enhancements' }, 'enhancements, editions and seals'), ' and your ', h('a', { href: '#/micatro/jokers' }, 'Jokers'), ' (left to right) add to it. Score = Chips × Mult. Discards swap cards for new draws.'),
        h('li', null, h('b', null, 'Money & the Shop. '), 'Clearing a Blind pays its reward plus $1 per unused hand and $1 interest per $5 held (up to $5). The Shop sells Jokers (5 slots max) and ', h('a', { href: '#/micatro/consumables' }, 'Tarot / Planet / Spectral'), ' cards (2 consumable slots), one ', h('a', { href: '#/micatro/vouchers' }, 'Voucher'), ' per Ante, and two ', h('a', { href: '#/micatro/boosters' }, 'booster packs'), '; rerolls start at $5. Sell a card for half its price.'),
        h('li', null, h('b', null, 'Packs. '), 'Open a pack to choose 1 (or 2 from a Mega) of its cards: Arcana = Tarots used on your hand right there, Celestial = Planets that level a hand, Spectral = powerful but risky, Standard = playing cards for your deck, Buffoon = Jokers.'),
        h('li', null, h('b', null, 'Decks & Stakes. '), 'Start a run on any of the ', h('a', { href: '#/micatro/decks' }, '15 decks'), ' and ', h('a', { href: '#/micatro/stakes' }, '8 stakes'), ' (each stake adds a new handicap on top of the ones before). Seeded runs are supported.'))),
    mcSection('Controls', 'Mouse, touch, keyboard and controller all work. Spectators can open card info but not act.',
      h('h3', { class: 'mc-h3' }, 'Mouse & touch'),
      table(['Input', 'Action'], [
        ['Click / tap a hand card', 'Select it (up to 5); again to deselect'],
        ['Click / tap a Joker, consumable, shop item or pack card', 'Select it and show its buttons: Sell · Use · Buy · Buy & Use · Redeem · Open · Select'],
        ['Drag a hand card, Joker or consumable', 'Reorder it (Joker order matters for scoring)'],
        ['Hover (mouse) / long-press (touch)', 'Card info tooltip'],
        ['Play Hand / Discard, Sort Hand: Rank / Suit', 'The on-table buttons'],
      ]),
      h('h3', { class: 'mc-h3' }, 'Keyboard'),
      table(['Key', 'When', 'Action'], [
        [kbd('Enter', 'P'), 'Choosing cards', 'Play hand'],
        [kbd('D', 'Delete', 'Backspace'), 'Choosing cards', 'Discard'],
        [kbd('1', '…', '9'), 'Choosing cards', 'Select / deselect the Nth card in hand'],
        [kbd('R', 'S'), 'Choosing cards', 'Sort hand by rank / suit'],
        [kbd('C'), 'Choosing cards', 'Clear the selection'],
        [kbd('Enter', 'Space'), 'Blind select', 'Select the blind'],
        [kbd('S'), 'Blind select', 'Skip the blind (take its tag)'],
        [kbd('Enter', 'Space'), 'Round won', 'Cash out'],
        [kbd('N', 'Enter'), 'Shop', 'Next round'],
        [kbd('R'), 'Shop', 'Reroll'],
        [kbd('S'), 'Opening a pack', 'Skip the pack'],
        [kbd('V'), 'Any time in a run', 'Deck view'],
        [kbd('I'), 'Any time in a run', 'Run info (hand levels, blinds, vouchers)'],
        [kbd('Esc'), 'Any time', 'Close a dialog, else open Options'],
      ]),
      h('h3', { class: 'mc-h3' }, 'Controller'),
      h('p', { class: 'muted' }, 'Everyone, guests included. Nintendo layout like the rest of the site — right face confirms, bottom face cancels; remap in the overworld’s OPTIONS → CONTROLS (see ', h('a', { href: '#/controls' }, 'Controls'), '). A gold reticle marks the focus; the hint bar shows the live button names.'),
      table(['Button', 'Action'], [
        ['Stick / D-pad', 'Move the reticle between every card and button (or the open dialog)'],
        ['Right face (confirm)', 'Hand card: select · shop item: buy · pack card: take · owned Joker/consumable: select (again = use the consumable) · button: press'],
        ['Hold confirm + ◄ ►', 'Move the focused hand card, Joker or consumable'],
        ['Top face (secondary)', 'Owned card: sell · shop consumable: buy & use · otherwise: sort hand (rank ⇄ suit)'],
        ['Left face (context)', 'Card info tooltips on / off'],
        ['LB / RB', 'The screen’s two main buttons: Play Hand / Discard · Select / Skip blind · Next Round / Reroll · Cash Out · Skip pack'],
        ['Bottom face (cancel)', 'Close a dialog · deselect'],
        ['Start', 'Pause menu (options, speed, run info, deck, quit)'],
        ['Select', 'Deck view'],
      ])));
}

let mcJokerQ = '', mcJokerRarity = 'all';
async function micatroJokersView() {
  content.replaceChildren(h('h1', null, 'Jokers'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Jokers'); if (!D || !mcStillOn('jokers')) return;
  const grid = h('div', { class: 'mc-grid' });
  const count = h('div', { class: 'result-count' });
  const draw = () => {
    const q = mcJokerQ.trim().toLowerCase();
    const list = D.jokers.filter(j => (mcJokerRarity === 'all' || j.rarity === mcJokerRarity)
      && (!q || (j.name + ' ' + j.lines.join(' ')).replace(/\{[^}]*\}/g, '').toLowerCase().includes(q)));
    grid.replaceChildren(...list.map(j => mcTile(j.soul ? [['Joker', j.soul], ['Joker', j.pos]] : [['Joker', j.pos]], j,
      [mcBadge(j.rarity, MC_BADGE[j.rarity]), mcCost(j.cost)],
      !j.bp ? h('div', { class: 'mc-note' }, 'Not copyable by Blueprint / Brainstorm') : null, { cls: 'mc-joker' })));
    if (!list.length) grid.replaceChildren(h('p', { class: 'muted' }, 'No jokers match.'));
    count.replaceChildren(String(list.length), h('span', null, ' of ' + D.jokers.length + ' jokers'));
  };
  const search = h('input', { type: 'search', class: 'mc-search', placeholder: 'Search jokers (name or text)…', value: mcJokerQ, autocomplete: 'off' });
  search.oninput = () => { mcJokerQ = search.value; draw(); };
  const sel = h('select', { class: 'adv-select mc-select' }, ['all', 'Common', 'Uncommon', 'Rare', 'Legendary'].map(r =>
    h('option', { value: r, selected: r === mcJokerRarity ? '' : null }, r === 'all' ? 'All rarities' : r)));
  sel.onchange = () => { mcJokerRarity = sel.value; draw(); };
  content.replaceChildren(mcBack(),
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Jokers'), h('p', { class: 'muted' }, 'All 150, in collection order, with their base values. Jokers score left to right; the shop rolls 70% Common / 25% Uncommon / 5% Rare — Legendaries come only from The Soul.')),
      count),
    h('div', { class: 'mc-filters' }, search, sel),
    grid);
  draw();
}

let mcConsTab = 'tarots';
async function micatroConsumablesView() {
  content.replaceChildren(h('h1', null, 'Consumables'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Consumables'); if (!D || !mcStillOn('consumables')) return;
  const TABS = [
    ['tarots', 'Tarot', D.tarots, 'Tarot cards change the cards in your hand or give money / cards. Bought in the shop or used straight from an Arcana pack.'],
    ['planets', 'Planet', D.planets, 'Each Planet levels up one poker hand (more base Chips and Mult). The three dwarf planets level the secret hands and only appear once you have played them.'],
    ['spectrals', 'Spectral', D.spectrals, 'Powerful, risky cards from Spectral packs (and rarely the shop on the Ghost Deck). The Soul (in Arcana and Spectral packs) and Black Hole (in Celestial and Spectral packs) are rare finds.'],
  ];
  const want = mcHashParam('item'); // (?item= opens the tab that holds it)
  if (want) { const t = TABS.find(x => x[2].some(c => c.key === want)); if (t) mcConsTab = t[0]; }
  const body = h('div');
  const bar = h('div', { class: 'lq-sizebar mc-tabs' });
  const draw = () => {
    const [, label, list, blurb] = TABS.find(t => t[0] === mcConsTab);
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === mcConsTab));
    body.replaceChildren(h('p', { class: 'muted' }, blurb),
      h('div', { class: 'mc-grid' }, list.map(c => mcTile(c.key === 'c_soul' ? [['centers', D.soulPos], ['Tarot', c.pos]] : [['Tarot', c.pos]], c,
        [mcBadge(c.dwarf ? 'Dwarf Planet' : label, MC_BADGE[label]), mcCost(c.cost)],
        c.hidden ? h('div', { class: 'mc-note' }, 'Rare: can replace a card in a pack') : null))));
  };
  for (const [k, label, list] of TABS) bar.append(h('button', { type: 'button', class: 'lq-sizebtn', 'data-tab': k, onclick: () => { mcConsTab = k; draw(); } }, label + ' (' + list.length + ')'));
  content.replaceChildren(mcBack(), mcHead('Tarot, Planet & Spectral', D.tarots.length + D.planets.length + D.spectrals.length, 'consumables'), bar, body);
  draw();
}

async function micatroVouchersView() {
  content.replaceChildren(h('h1', null, 'Vouchers'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Vouchers'); if (!D || !mcStillOn('vouchers')) return;
  const nameOf = k => (D.vouchers.find(v => v.key === k) || {}).name || k;
  content.replaceChildren(mcBack(),
    mcHead('Vouchers', D.vouchers.length, 'vouchers', 'One Voucher is for sale in the shop each Ante ($10). Each comes as a base + an upgrade; the upgrade only appears after you redeem its base. Effects are permanent for the run.'),
    h('div', { class: 'mc-grid' }, D.vouchers.map(v => mcTile([['Voucher', v.pos]], v,
      [mcBadge(v.requires ? 'Upgrade' : 'Voucher', v.requires ? '#c2410c' : MC_BADGE.Voucher), mcCost(v.cost)],
      v.requires ? h('div', { class: 'mc-note' }, 'Requires ', h('b', null, v.requires.map(nameOf).join(', '))) : null))));
}

async function micatroBoostersView() {
  content.replaceChildren(h('h1', null, 'Booster Packs'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Booster Packs'); if (!D || !mcStillOn('boosters')) return;
  const KINDS = [['Arcana', 'Tarot cards, used right away on a hand of 8 dealt from your deck.'], ['Celestial', 'Planet cards that level up poker hands.'],
    ['Spectral', 'Spectral cards, used right away on a hand dealt from your deck.'], ['Standard', 'Playing cards (often enhanced, with editions or seals) added to your deck.'],
    ['Buffoon', 'Jokers.']];
  const total = D.boosters.reduce((n, b) => n + (b.weight || 0), 0);
  content.replaceChildren(mcBack(),
    mcHead('Booster Packs', D.boosters.length, 'packs', 'Two packs are in every shop. Normal packs show 3 cards (Buffoon/Spectral 2), Jumbo 5 (4), Mega 5 (4) and let you take 2. Each kind has several art variants. “Odds” is the pack’s share of the shop’s pack slot.'),
    ...KINDS.map(([kind, blurb]) => {
      const list = D.boosters.filter(b => b.kind === kind);
      return mcSection(kind + ' Packs', blurb, h('div', { class: 'mc-grid' }, list.map(b => mcTile([['Booster', b.pos]], b,
        [mcBadge(kind, MC_BADGE.Booster), mcCost(b.cost)],
        h('div', { class: 'mc-note' }, 'Choose ' + b.choose + ' of ' + b.size + ' · odds ' + (100 * b.weight / total).toFixed(1) + '%')))));
    }));
}

async function micatroTagsView() {
  content.replaceChildren(h('h1', null, 'Skip Tags'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Skip Tags'); if (!D || !mcStillOn('tags')) return;
  content.replaceChildren(mcBack(),
    mcHead('Skip Tags', D.tags.length, 'tags', 'Skipping a Small or Big Blind gives up its reward and the shop that follows, but grants the Tag shown under it. Some tags only appear from a given Ante.'),
    h('div', { class: 'mc-rows' }, D.tags.map(t => h('div', { class: 'mc-row', 'data-key': t.key },
      mcSprite([['tags', t.pos]], null, 1, t.name),
      h('div', { class: 'mc-row-body' },
        h('div', { class: 'mc-nm' }, t.name, t.minAnte ? h('span', { class: 'mc-pill' }, 'Ante ' + t.minAnte + '+') : null),
        mcDesc(t.lines), mcInfo(t.info))))));
}

async function micatroBlindsView() {
  content.replaceChildren(h('h1', null, 'Blinds'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Blinds'); if (!D || !mcStillOn('blinds')) return;
  const row = b => h('div', { class: 'mc-row mc-blind', 'data-key': b.key, style: b.colour ? 'border-left-color:' + b.colour : null },
    mcSprite([['blind', b.pos]], 'mc-chip', 1, b.name),
    h('div', { class: 'mc-row-body' },
      h('div', { class: 'mc-nm' }, b.name,
        b.minAnte ? h('span', { class: 'mc-pill' }, b.showdown ? 'Ante 8, 16, …' : 'Ante ' + b.minAnte + '+') : null,
        h('span', { class: 'mc-pill mc-x' }, '×' + b.mult + ' score'), h('span', { class: 'mc-pill mc-money' }, '$' + b.dollars),
        b.colour ? h('span', { class: 'mc-swatch', title: 'Boss colour ' + b.colour, style: 'background:' + b.colour }) : null),
      b.lines.length ? mcDesc(b.lines) : h('div', { class: 'mc-desc muted' }, 'No effect.')));
  const plain = D.blinds.filter(b => !b.boss), bosses = D.blinds.filter(b => b.boss && !b.showdown).sort((a, b) => a.minAnte - b.minAnte || a.name.localeCompare(b.name));
  const finals = D.blinds.filter(b => b.showdown);
  const ac = D.anteChips;
  content.replaceChildren(mcBack(),
    mcHead('Blinds', D.blinds.length, 'blinds', 'Every Ante is a Small Blind, a Big Blind and a Boss Blind. The target score is the Ante’s base chips × the Blind’s multiplier. Bosses are drawn from those whose minimum Ante you have reached (no repeats until the pool runs dry); every 8th Ante is a Showdown boss instead.'),
    mcSection('Blind targets', 'Base chips per Ante (Small Blind = ×1, Big = ×1.5, most Bosses = ×2). The Plasma Deck doubles them all.',
      h('div', { class: 'mc-scroll' }, h('table', { class: 'mc-table' },
        h('thead', null, h('tr', null, h('th', null, 'Ante'), ...[1, 2, 3, 4, 5, 6, 7, 8].map(a => h('th', null, a)))),
        h('tbody', null,
          h('tr', null, h('th', null, 'White / Red Stake'), ...ac[1].map(n => h('td', null, n.toLocaleString('en-US')))),
          h('tr', null, h('th', null, 'Green / Black / Blue'), ...ac[2].map(n => h('td', null, n.toLocaleString('en-US')))),
          h('tr', null, h('th', null, 'Purple / Orange / Gold'), ...ac[3].map(n => h('td', null, n.toLocaleString('en-US')))))))),
    mcSection('Small & Big Blinds', null, h('div', { class: 'mc-rows' }, plain.map(row))),
    mcSection('Boss Blinds', 'Sorted by the first Ante they can appear on. Chip sprite = frame 0 of the animated chip; the left stripe is the boss colour.', h('div', { class: 'mc-rows' }, bosses.map(row))),
    mcSection('Showdown Blinds', 'The Ante 8 finisher (and every 8th Ante in Endless).', h('div', { class: 'mc-rows' }, finals.map(row))));
}

async function micatroDecksView() {
  content.replaceChildren(h('h1', null, 'Decks'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Decks'); if (!D || !mcStillOn('decks')) return;
  content.replaceChildren(mcBack(),
    mcHead('Decks', D.decks.length, 'decks', 'The deck you pick on the New Run screen. Every deck is unlocked in Micatro.'),
    h('div', { class: 'mc-grid' }, D.decks.map(d => mcTile([['centers', d.pos]], d, null))));
}

async function micatroStakesView() {
  content.replaceChildren(h('h1', null, 'Stakes'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Stakes'); if (!D || !mcStillOn('stakes')) return;
  content.replaceChildren(mcBack(),
    mcHead('Stakes', D.stakes.length, 'stakes', 'The difficulty you pick on the New Run screen. Each stake keeps every handicap of the ones below it.'),
    h('div', { class: 'mc-rows' }, D.stakes.map(s => h('div', { class: 'mc-row', 'data-key': s.key },
      mcSprite([['chips', s.pos]], null, 1, s.chip),
      h('div', { class: 'mc-row-body' }, h('div', { class: 'mc-nm' }, s.name, h('span', { class: 'mc-pill' }, 'Level ' + s.level)), mcDesc(s.lines))))),
    h('p', { class: 'muted' }, 'The Eternal, Perishable and Rental stickers are described on ', h('a', { href: '#/micatro/enhancements' }, 'Enhancements, Editions & Seals'), '.'));
}

/** A small playing card: base card + rank/suit front (+ an enhancement in place of the base). */
const mcPlaying = (D, code, scale, under) => mcSprite([['deck', D.cards[code]], ['centers', under || D.basePos]], 'mc-pc', scale, code);
async function micatroHandsView() {
  content.replaceChildren(h('h1', null, 'Poker Hands'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Poker Hands'); if (!D || !mcStillOn('hands')) return;
  content.replaceChildren(mcBack(),
    mcHead('Poker Hands', D.hands.length, 'hands', 'Base Chips × Mult at level 1, and what each level (from its Planet card) adds. The highest-ranking hand your cards make is the one scored; only the cards that form it score (dimmed cards below don’t). Secret hands (Five of a Kind, Flush House, Flush Five) need duplicate cards in your deck and stay hidden until first played.'),
    h('div', { class: 'mc-hands' }, D.hands.map(hd => h('div', { class: 'mc-hand', 'data-key': hd.name },
      h('div', { class: 'mc-hand-info' },
        h('div', { class: 'mc-nm' }, hd.name, hd.secret ? h('span', { class: 'mc-pill' }, 'Secret') : null),
        h('div', { class: 'mc-score' }, h('span', { class: 'mc-chipsbox' }, hd.chips), ' × ', h('span', { class: 'mc-multbox' }, hd.mult)),
        h('div', { class: 'mc-note' }, 'Per level: ', h('b', { style: 'color:' + MC_COL.chips }, '+' + hd.lChips + ' Chips'), ' ', h('b', { style: 'color:' + MC_COL.mult }, '+' + hd.lMult + ' Mult'), hd.planet ? ' · ' + hd.planet : ''),
        mcDesc(hd.lines)),
      h('div', { class: 'mc-example' }, (hd.example || []).map(([code, scores]) => {
        const el = mcPlaying(D, code, 0.5);
        if (!scores) el.classList.add('mc-dim');
        return el;
      }))))));
}

async function micatroEnhancementsView() {
  content.replaceChildren(h('h1', null, 'Enhancements, Editions & Seals'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Enhancements'); if (!D || !mcStillOn('enhancements')) return;
  const FRONTS = { m_bonus: 'H_K', m_mult: 'C_Q', m_wild: 'D_J', m_glass: 'S_A', m_steel: 'H_T', m_stone: null, m_gold: 'D_7', m_lucky: 'C_7' };
  const joker = (D.jokers.find(j => j.key === 'j_joker') || {}).pos || { x: 0, y: 0 };
  content.replaceChildren(mcBack(),
    mcHead('Enhancements, Editions & Seals', null, null, 'Modifiers a playing card (or Joker) can carry. Tarot cards enhance; Spectral cards add seals and editions; Standard packs can roll all three.'),
    mcSection('Enhancements', 'One per playing card — replaces the card’s base. Stone Cards have no rank or suit.',
      h('div', { class: 'mc-grid' }, D.enhancements.map(e => mcTile(FRONTS[e.key] ? [['deck', D.cards[FRONTS[e.key]]], ['centers', e.pos]] : [['centers', e.pos]], e, [mcBadge('Enhancement', '#8389dd')])))),
    mcSection('Editions', 'On Jokers and playing cards (Negative only on Jokers / consumables). The shimmer here is a stand-in for the in-game shader.',
      h('div', { class: 'mc-grid' }, D.editions.map(e => mcTile([['Joker', joker]], e, [mcBadge('Edition', '#4ca893')], null, { sprCls: 'mc-ed mc-ed-' + e.key.slice(2) })))),
    mcSection('Seals', 'One per playing card, drawn in its corner.',
      h('div', { class: 'mc-grid' }, D.seals.map(s => mcTile([['centers', s.pos], ['deck', D.cards.S_A], ['centers', D.basePos]], s, [mcBadge('Seal', MC_COL[s.key.toLowerCase()] || '#6b7793')])))),
    mcSection('Stickers', 'Shop Jokers on the higher ', h('a', { href: '#/micatro/stakes' }, 'stakes'), ' can carry these.',
      h('div', { class: 'mc-grid' }, D.stickers.map(s => mcTile([['stickers', s.pos], ['Joker', joker]], s, [mcBadge('Sticker', MC_COL[s.key])])))));
}

async function micatroChallengesView() {
  content.replaceChildren(h('h1', null, 'Challenges'), h('p', { class: 'muted' }, 'Loading…'));
  const D = await mcLoadOr('Challenges'); if (!D || !mcStillOn('challenges')) return;
  const list = D.challenges || [];
  content.replaceChildren(mcBack(),
    mcHead('Challenges', list.length, 'challenges', 'Balatro’s challenge runs (main menu → Challenges). Each plays on the Challenge Deck at the first stake, with its own rules, starting cards, bans and deck. The text is the Challenges screen’s own.'),
    h('div', { class: 'mc-rows' }, list.map(c => mcModRow(c))));
}

// ---------- Micatro mods + native features (big numbers, deck editor, replays) ----------
// Data: designwiki/data/micatro_mods.json (index: credits, options, systems, intended-design
// fixes, counts, every mod atlas, the feature pages) and designwiki/data/micatro_mods/<id>.json
// (one mod's content sections), generated from the mod modules by
// tools/micatro/gen_designwiki_mods.mjs. Mod art is a CSS cell of the mod's own atlas
// (/micatro/mods/<id>/assets/2x/..., the mod-art Pages project in production).
let mcModsPromise = null;
const mcModPromises = {};
function loadMicatroMods() {
  if (!mcModsPromise) mcModsPromise = fetch('data/micatro_mods.json' + CB).then(r => { if (!r.ok) throw new Error('micatro_mods.json ' + r.status); return r.json(); })
    .then(D => { for (const [name, a] of Object.entries(D.atlases || {})) MC_ATLAS['@' + name] = [a.src, a.w, a.h, a.cw, a.ch, a.tiles ? a : null]; return D; });
  return mcModsPromise;
}
function loadMicatroMod(id) {
  if (!mcModPromises[id]) mcModPromises[id] = loadMicatroMods().then(() => fetch('data/micatro_mods/' + encodeURIComponent(id) + '.json' + CB))
    .then(r => { if (!r.ok) throw new Error(id + '.json ' + r.status); return r.json(); });
  return mcModPromises[id];
}
/** replaceChildren that skips the null of an absent optional section (replaceChildren would print "null"). */
const mcPut = (...nodes) => content.replaceChildren(...nodes.filter(n => n != null));
const mcOn = (...seg) => { const p = location.hash.slice(1).split('?')[0].split('/').filter(Boolean); return p[0] === 'micatro' && seg.every((s, i) => (p[i + 1] || '') === s) && p.length === seg.length + 1; };
const mcHashParam = k => new URLSearchParams(location.hash.split('?')[1] || '').get(k);
const mcModBack = () => h('p', { class: 'lp-back' }, h('a', { href: '#/micatro-mods' }, '← Micatro Mods'));
/** Art layers of a generated item (['@atlas' | vanilla atlas, pos] top-most first), or a blank card. */
function mcArt(it, cls, scale = 1) {
  const layers = (it.art || []).filter(l => l && MC_ATLAS[l[0]]);
  if (!layers.length) return h('div', { class: 'mc-spr mc-noart' + (it.sq ? ' sq' : ''), title: it.name }, '?');
  return mcSprite(layers, cls || (it.chip ? 'mc-chip' : null), scale, it.name);
}
const mcPills = it => (it.pills || []).map(p => h('span', { class: 'mc-pill' + (p.cls ? ' mc-' + p.cls : '') + (p.off ? ' mc-off' : '') }, p.text));
/** A mod badge on an item listed outside its mod's page (links to the mod page). */
const mcModTag = m => m ? h('a', { class: 'mc-modtag', href: '#/micatro-mods/mod/' + m.id, 'data-mod': m.id, title: m.name + ' — the mod’s page', style: m.badge ? '--mod:' + m.badge : null }, m.name) : null;
function mcModTile(it, mod) {
  return h('div', { class: 'mc-tile' + (it.edition ? ' mc-edtile' : ''), 'data-key': it.key, id: 'mc-' + it.key, 'data-mod': mod ? mod.id : null },
    h('div', { class: 'mc-art' }, mcArt(it)),
    h('div', { class: 'mc-nm' }, it.name),
    mod ? h('div', { class: 'mc-badges' }, mcModTag(mod)) : null,
    h('div', { class: 'mc-badges' }, (it.badges || []).map(b => mcBadge(b.label, b.colour)), mcCost(it.cost)),
    mcDesc(it.lines, it.colours), mcInfo(it.info),
    it.note ? h('div', { class: 'mc-note' }, it.note) : null,
    it.pills && it.pills.length ? h('div', { class: 'mc-badges' }, mcPills(it)) : null);
}
function mcModRow(it, mod) {
  return h('div', { class: 'mc-row' + (it.chip ? ' mc-blind' : '') + (it.colour && !it.chip ? ' mc-colrow' : ''), 'data-key': it.key, id: 'mc-' + it.key, 'data-mod': mod ? mod.id : null, style: it.colour ? 'border-left-color:' + it.colour : null },
    it.art ? mcArt(it, null, it.sq || it.chip ? 1 : 0.5) : null,
    h('div', { class: 'mc-row-body' },
      h('div', { class: 'mc-nm' }, it.name, mcModTag(mod), (it.badges || []).map(b => mcBadge(b.label, b.colour)), mcPills(it),
        it.colour ? h('span', { class: 'mc-swatch', style: 'background:' + it.colour }) : null),
      it.lines && it.lines.length ? mcDesc(it.lines, it.colours) : h('div', { class: 'mc-desc muted' }, 'No effect.'), mcInfo(it.info)));
}
function mcModHand(it, mod) {
  return h('div', { class: 'mc-hand', 'data-key': it.key, id: 'mc-' + it.key, 'data-mod': mod ? mod.id : null },
    h('div', { class: 'mc-hand-info' },
      h('div', { class: 'mc-nm' }, it.name, mcModTag(mod), it.secret ? h('span', { class: 'mc-pill' }, 'Secret') : null),
      h('div', { class: 'mc-score' }, h('span', { class: 'mc-chipsbox' }, it.chips), ' × ', h('span', { class: 'mc-multbox' }, it.mult)),
      h('div', { class: 'mc-note' }, 'Per level: ', h('b', { style: 'color:' + MC_COL.chips }, '+' + it.lChips + ' Chips'), ' ', h('b', { style: 'color:' + MC_COL.mult }, '+' + it.lMult + ' Mult')),
      mcDesc(it.lines)));
}
const mcPlural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const MC_SECTION_UNIT = { jokers: ['joker', 'jokers'], vouchers: ['voucher', 'vouchers'], boosters: ['pack', 'packs'], decks: ['deck', 'decks'], tags: ['tag', 'tags'], blinds: ['blind', 'blinds'], stakes: ['stake', 'stakes'] };

// ---------- the Micatro Mods section (#/micatro-mods) ----------
// A peer of the vanilla Micatro section: an overview (#/micatro-mods), one page per KIND of item across
// every mod (#/micatro-mods/<category>, from micatro_mods.json `categories`), and one page per mod
// (#/micatro-mods/mod/<id>). Category pages keep their filters in the hash (?mod= ?type= ?rarity= ?q=)
// so a filtered view is a link; ?item=<key> highlights one entry.
const MM = '#/micatro-mods';
const mmOn = (...seg) => { const p = location.hash.slice(1).split('?')[0].split('/').filter(Boolean); return p[0] === 'micatro-mods' && seg.every((s, i) => (p[i + 1] || '') === s) && p.length === seg.length + 1; };
const mmBack = () => h('p', { class: 'lp-back' }, h('a', { href: MM }, '← Micatro Mods'));
const mmFail = title => content.replaceChildren(h('h1', null, title), h('p', { class: 'muted' }, 'Could not load the mod data.'));
/** A generated item drawn the way its section draws it (tile / row / hand), with its mod's badge. */
const mmItem = (kind, it, mod) => kind === 'row' ? mcModRow(it, mod) : kind === 'hand' ? mcModHand(it, mod) : mcModTile(it, mod);
const mmText = it => (it.name + ' ' + (it.lines || []).join(' ') + ' ' + (it.badges || []).map(b => b.label).join(' ') + ' ' + (it.info || []).map(i => i.name + ' ' + i.lines.join(' ')).join(' '))
  .replace(/\{[^}]*\}/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // (Blåhaj is found as "blahaj")
/** A category's cover sprite (cards at half size, square art at full), or a text stand-in. */
function mmCover(cover, cls) {
  const layers = cover ? cover.art.filter(l => l && MC_ATLAS[l[0]]) : [];
  return layers.length ? mcSprite(layers, cls, cover.sq ? 1 : 0.5, cover.name) : h('span', { class: (cls || '') + ' mc-idx-txt' }, '♠♥');
}
/** Section id -> category id (every mod section belongs to one category page). */
const mmCatOf = D => { const o = {}; for (const c of D.categories || []) for (const s of c.sections) o[s.id] = c.id; return o; };

// ---------- incremental rendering of the big lists (Pokermon alone has 457 jokers)
// A list is a run of "slots" (a container + the items it will hold, in page order). The first MM_PAGE
// items are drawn at once; the rest come MM_PAGE at a time as the footer nears the viewport
// (IntersectionObserver), or from its Show more / Show all buttons. A slot (and its heading) stays
// hidden until it has a drawn item. Sprites are CSS backgrounds, so an undrawn card fetches no atlas.
const MM_PAGE = 60;
/** slots: [{wrap, items, draw(item) -> node, show?: [els], block?: el}]; first = items to draw up front. */
function mmPager(slots, first, stillOn) {
  const total = slots.reduce((n, sl) => n + sl.items.length, 0);
  let budget = Math.max(MM_PAGE, Math.ceil((first || 0) / MM_PAGE) * MM_PAGE);
  const more = h('button', { type: 'button', class: 'mm-more' }), all = h('button', { type: 'button', class: 'mm-more mm-all' });
  const left = h('span', { class: 'muted mm-left' });
  const foot = h('div', { class: 'mm-pager' }, left, more, all);
  let io = null;
  const fill = () => {
    let room = budget, drawn = 0;
    const blocks = new Map();
    for (const sl of slots) {
      sl.n = sl.n || 0;
      const want = Math.min(sl.items.length, Math.max(0, room));
      if (sl.n < want) {
        const frag = document.createDocumentFragment();
        while (sl.n < want) frag.appendChild(sl.draw(sl.items[sl.n++]));
        sl.wrap.appendChild(frag);
      }
      room -= sl.items.length; drawn += sl.n;
      sl.wrap.hidden = !sl.n;
      for (const el of sl.show || []) el.hidden = !sl.n;
      if (sl.block) blocks.set(sl.block, (blocks.get(sl.block) || 0) + sl.n);
    }
    for (const [b, n] of blocks) b.hidden = !n;
    const rest = total - drawn;
    foot.hidden = rest <= 0;
    left.textContent = 'Showing ' + drawn.toLocaleString('en-US') + ' of ' + total.toLocaleString('en-US') + '.';
    more.textContent = 'Show ' + Math.min(MM_PAGE, rest) + ' more';
    all.textContent = 'Show all ' + total.toLocaleString('en-US');
    if (rest <= 0 && io) { io.disconnect(); io = null; }
    else if (io) { io.unobserve(foot); io.observe(foot); } // (re-checks at once: keeps filling while the footer is still in view)
  };
  const grow = n => { budget += n; fill(); };
  more.onclick = () => grow(MM_PAGE);
  all.onclick = () => grow(total);
  if (typeof IntersectionObserver === 'function') io = new IntersectionObserver(es => {
    if (!stillOn() || !foot.isConnected) { if (io) io.disconnect(); io = null; return; }
    if (es.some(e => e.isIntersecting) && !foot.hidden) grow(MM_PAGE);
  }, { rootMargin: '0px 0px 900px 0px' });
  return { foot, total, start() { fill(); }, stop() { if (io) io.disconnect(); io = null; } };
}
/** The draw position of an item in a pager's slots (-1 when absent). */
const mmSlotIndex = (slots, pred) => { let i = 0; for (const sl of slots) { const k = sl.items.findIndex(pred); if (k >= 0) return i + k; i += sl.items.length; } return -1; };

async function micatroModsView() {
  content.replaceChildren(h('h1', null, 'Micatro Mods'), h('p', { class: 'muted' }, 'Loading…'));
  let D; try { D = await loadMicatroMods(); } catch (e) { return mmFail('Micatro Mods'); }
  if (!mmOn()) return;
  const total = D.mods.reduce((n, m) => n + m.total, 0);
  const cats = D.categories || [];
  const art = ['jokers', 'new-consumables'].map(id => (cats.find(c => c.id === id) || {}).cover).filter(c => c && c.art.some(l => MC_ATLAS[l[0]]));
  mcPut(
    h('div', { class: 'mc-hero' },
      h('div', null,
        h('h1', null, 'Micatro Mods'),
        h('p', null, D.mods.length + ' popular Balatro mods, rebuilt natively for ', h('a', { href: '#/micatro' }, 'Micatro'), ' — every card, rule and number from the originals (with their bugs fixed the way their authors meant). ', h('b', null, total.toLocaleString('en-US') + ' entries'), ' in all: browse them by kind below, or open one mod’s own page.'),
        h('p', null, h('a', { class: 'mc-play', href: '/micatro/' }, '▶ Play Micatro'), ' ', h('span', { class: 'muted' }, 'New Run → Mods: switch any of them on for a run'))),
      art.length ? h('div', { class: 'mc-hero-art' }, art.map(c => mcSprite(c.art.filter(l => MC_ATLAS[l[0]]), null, 1, c.name))) : null),
    h('div', { class: 'lp-grid mc-index' }, cats.map(c => h('a', { class: 'lp-tile mc-idx', href: MM + '/' + c.id, 'data-cat': c.id },
      mmCover(c.cover, 'mc-idx-spr'),
      h('span', { class: 'mc-idx-txtwrap' }, h('span', { class: 'lp-name' }, c.title),
        h('span', { class: 'lp-count' }, c.count.toLocaleString('en-US') + ' entries · ' + mcPlural(Object.keys(c.perMod).length, 'mod', 'mods')))))),
    mcSection('By mod', 'Each mod’s own page: credits, how to turn it on, its options, the bugs fixed as its author intended, and all of its cards.',
      h('div', { class: 'mc-modgrid' }, D.mods.map(m => h('a', { class: 'lp-tile mc-modcard', href: MM + '/mod/' + m.id, 'data-mod': m.id, style: m.badge ? 'border-top:4px solid ' + m.badge : null },
        h('div', { class: 'mc-modcard-top' },
          m.cover ? mcSprite(m.cover.art.filter(l => MC_ATLAS[l[0]]), 'mc-modcover', m.cover.sq ? 1 : 0.5, m.name) : null,
          h('div', null, h('span', { class: 'lp-name' }, m.name), h('div', { class: 'mc-note mc-by' }, m.by))),
        h('div', { class: 'mc-moddesc' }, m.description),
        h('div', { class: 'lp-meta' }, h('span', { class: 'lp-count' }, m.total + ' entries' + (m.fixes.length ? ' · ' + m.fixes.length + ' fixes' : '')),
          m.requires.length ? h('span', { class: 'mc-pill' }, 'Needs ' + m.requires.map(r => (D.mods.find(x => x.id === r) || { name: r }).name).join(', ')) : null))))),
    mcSection('Turning mods on', null, h('ul', { class: 'mc-list' },
      h('li', null, h('b', null, 'Per run. '), 'On the New Run screen, open ', h('b', null, 'Mods'), ' and switch on the ones you want for that run. A mod that is off is gone: none of its cards, rules or art. Mods that need another mod (Pokermon add-ons, Þe Autumn Circus) switch it on with them.'),
      h('li', null, h('b', null, 'Options. '), 'Some mods have options (Pokermon’s generations, BETMMA’s per-voucher toggles, Bunco’s reworks) under their name in the Mods panel; each mod page lists them with their defaults.'),
      h('li', null, h('b', null, 'Sleeves, challenges & skins. '), 'With a mod on, its ', h('a', { href: MM + '/sleeves' }, 'sleeves'), ' appear under the deck on the New Run screen and its ', h('a', { href: MM + '/challenges' }, 'challenges'), ' on the Challenges screen; ', h('a', { href: MM + '/skins' }, 'deck skins'), ' are picked in Options → Card skins.'),
      h('li', null, h('b', null, 'Saved with the run. '), 'The chosen mods and options are part of the run, so resuming, ', h('a', { href: '#/micatro/replays' }, 'replays'), ' and spectators load exactly the same set. Modded runs go on the leaderboard’s Modded tab.'),
      h('li', null, h('b', null, 'Art. '), 'A mod’s art downloads only when a run turns it on.'))),
    // Pokermon run badges + achievements (micatro/mods/pokermon/systems/runbadges.js, micatro/js/ui/progress.js)
    mcSection('Pokermon: Nuzlocke & Monotype runs', 'Two challenge badges every Pokermon run tracks by itself. Win the run (beat Ante 8) with one still intact to earn it.',
      h('ul', { class: 'mc-list mc-nuzlocke' },
        h('li', null, h('b', null, 'Nuzlocke. '), 'Never sell a joker, and gain at most ', h('b', null, 'one new joker per shop'), '. A “shop” runs from one blind’s start to the next blind’s start: the blind itself, its cash-out, the shop and its packs, and any tags you take by skipping before the next blind. Every way of getting a new joker counts: buying one, a pack pick, a tag (Top-up, Buffoon), a card that makes one (Poké / Great / Ultra / Master Ball, Judgement, Wraith, Riff-raff) or a copy (Ankh, Invisible Joker). Evolutions, Ditto and Tera changes are the same joker, so they don’t count. Jokers destroyed by an effect (Nightmare, a joker eating another, Perishable, fainting) don’t break it; only selling does.'),
        h('li', null, h('b', null, 'Monotype. '), 'Start every round (each blind) with jokers of only one Pokémon type (Grass, Fire, Water, Lightning, Psychic, Fighting, Colorless, Dark, Metal, Fairy, Dragon or Earth). It is checked only when a blind starts: buying an off-type joker is fine if you sell it before the next round, and the shop warns you when one is in your row. The type locks at the first blind you start with jokers. A joker matches the run’s type if EITHER the type it had when you got it OR its current type (a Tera sticker counts) is that type; a Stellar Tera matches every type. So an evolution into another type never breaks it (Ursaring → Ursaluna keeps its gained type), and Tera-ing an off-type joker to the run’s type makes it count. Only a joker off-type both ways breaks it. A copy (Ankh, Invisible Joker) keeps the original’s Tera sticker and counts as the type the original was gained as. At the first lock the row must share one type under this rule: the gained types are tried first (left to right), then the current types.'),
        h('li', null, h('b', null, 'Non-Pokémon jokers. '), 'Gaining any joker without a Pokémon type (a base-game joker, another mod’s joker), by any means, ends the Nuzlocke at once; starting a round with one ends the Monotype. (Selling it in time keeps the Monotype but, as a sell, still ends the Nuzlocke.)'),
        h('li', null, h('b', null, 'On screen. '), 'The badges sit on the HUD while the run still qualifies; when one breaks it disappears and a message says why. Run Info → Badges shows the status. Seeded and challenge runs earn nothing (like the win stickers), and runs without Pokermon show nothing.'),
        h('li', null, h('b', null, 'Rewards. '), 'The win screen, your replays and your leaderboard row show the badges earned (the row’s tag is reported by the game, like the score). Your record (Nuzlocke wins, Monotype wins per type, both at once) and five achievements (Nuzlocke, Monotype, Type Master: all 12 types, Purist: both in one run, Golden Nuzlocke: Gold Stake) are saved on your account: Main menu → Achievements. The run’s jokers and its deck get a win sticker: Pikachu for any Pokermon win, Aipom for a Nuzlocke, Ambipom for a Monotype, Arceus for both (Arceus > Ambipom > Aipom > Pikachu > the plain stake sticker), ringed in the stake’s colour.'))),
    h('p', { class: 'mc-crosslink' }, 'Balatro’s own cards, rules and controls: ', h('a', { href: '#/micatro' }, 'Micatro (the base game) →')));
}

const MM_BLIND_GROUPS = [
  ['plain', 'Small & Big Blinds', 'Replacements for the Small or Big Blind.'],
  ['boss', 'Boss Blinds', 'Drawn like Balatro’s bosses once their minimum Ante is reached.'],
  ['showdown', 'Showdown Blinds', 'Ante 8 finishers (and every 8th Ante in Endless).'],
  ['superboss', 'Superbosses', 'More Fluff’s DX bosses: redeem The Ticket and Ante 8’s boss becomes one of these, the only blind that wins the run. They also show up as showdowns past the winning Ante.'],
];
async function micatroModsCategoryView(cid) {
  content.replaceChildren(h('h1', null, 'Micatro Mods'), h('p', { class: 'muted' }, 'Loading…'));
  let D; try { D = await loadMicatroMods(); } catch (e) { return mmFail('Micatro Mods'); }
  const C = (D.categories || []).find(c => c.id === cid);
  if (!mmOn(cid)) return;
  if (!C) return notFound();
  const mods = D.mods.filter(m => C.perMod[m.id]);
  let F; try { F = await Promise.all(mods.map(m => loadMicatroMod(m.id))); } catch (e) { return mmFail(C.title); }
  if (!mmOn(cid)) return;
  const secOf = Object.fromEntries(C.sections.map(s => [s.id, s]));
  const all = []; // {it, m, sid, kind}
  mods.forEach((m, i) => { for (const s of F[i].sections) if (secOf[s.id]) for (const it of s.items) all.push({ it, m, sid: s.id, kind: s.kind }); });
  const tabs = C.sections.length > 1 && (cid === 'consumables' || cid === 'new-consumables');
  const rarities = cid === 'jokers' ? [...new Set(all.map(x => x.it.rarity).filter(Boolean))] : [];
  // filters: from the hash (a filtered view is a link); ?item= clears whatever would hide it
  const P = new URLSearchParams(location.hash.split('?')[1] || '');
  const st = {
    mod: mods.some(m => m.id === P.get('mod')) ? P.get('mod') : 'all',
    type: secOf[P.get('type')] ? P.get('type') : C.sections[0].id,
    rarity: rarities.includes(P.get('rarity')) ? P.get('rarity') : 'all',
    q: P.get('q') || '',
  };
  const want = P.get('item');
  const hit = want && all.find(x => x.it.key === want);
  if (hit) { if (st.mod !== 'all' && st.mod !== hit.m.id) st.mod = 'all'; st.q = ''; st.rarity = 'all'; st.type = hit.sid; }
  const sync = () => {
    const q = new URLSearchParams();
    if (st.mod !== 'all') q.set('mod', st.mod);
    if (tabs && st.type !== C.sections[0].id) q.set('type', st.type);
    if (st.rarity !== 'all') q.set('rarity', st.rarity);
    if (st.q.trim()) q.set('q', st.q.trim());
    const qs = q.toString();
    history.replaceState(null, '', MM + '/' + cid + (qs ? '?' + qs : ''));
  };
  const body = h('div');
  const count = h('div', { class: 'result-count' });
  const bar = tabs ? h('div', { class: 'lq-sizebar mc-tabs' }) : null;
  let slots = [], pager = null;
  const drawX = x => mmItem(x.kind, x.it, x.m);
  /** One group's containers (empty: the pager fills them) — every mod: one run of tiles per mod, under its badge. */
  const list = (kind, items, showMods, block) => {
    const wrap = kind === 'row' ? 'mc-rows' : kind === 'hand' ? 'mc-hands' : 'mc-grid';
    if (!showMods) { const w = h('div', { class: wrap }); slots.push({ wrap: w, items, draw: drawX, block }); return [w]; }
    const out = [];
    for (const m of mods) {
      const mine = items.filter(x => x.m === m);
      if (!mine.length) continue;
      const head = h('h3', { class: 'mc-h3 mm-modhead' }, mcModTag(m), h('span', { class: 'num' }, ' ' + mine.length)), w = h('div', { class: wrap });
      slots.push({ wrap: w, items: mine, draw: drawX, show: [head], block });
      out.push(head, w);
    }
    return out;
  };
  const draw = (focus) => {
    if (pager) pager.stop();
    slots = [];
    const q = st.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const pass = all.filter(x => (st.mod === 'all' || x.m.id === st.mod) && (st.rarity === 'all' || x.it.rarity === st.rarity) && (!q || mmText(x.it).includes(q)));
    let shown = pass;
    if (tabs) {
      bar.replaceChildren(...C.sections.map(s => {
        const n = pass.filter(x => x.sid === s.id).length;
        return h('button', { type: 'button', class: 'lq-sizebtn' + (s.id === st.type ? ' active' : ''), 'data-tab': s.id, onclick: () => { st.type = s.id; sync(); draw(); } }, s.title + ' (' + n + ')');
      }));
      shown = pass.filter(x => x.sid === st.type);
    }
    const many = st.mod === 'all';
    const blocks = [];
    const secs = tabs ? [secOf[st.type]] : C.sections;
    for (const s of secs) {
      const items = shown.filter(x => x.sid === s.id);
      if (!items.length) continue;
      const groups = s.id === 'blinds' ? MM_BLIND_GROUPS.map(([g, t, b]) => [t, b, items.filter(x => (x.it.group || 'boss') === g)]) : [[secs.length > 1 ? s.title : null, null, items]];
      for (const [title, blurb, gi] of groups) {
        if (!gi.length) continue;
        const block = title ? h('section', { class: 'lp-tier', 'data-section': s.id }, h('div', { class: 'lp-tier-head' }, h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + gi.length + ')')), blurb ? h('p', { class: 'muted' }, blurb) : null))
          : h('div', { 'data-section': s.id });
        block.append(...list(s.kind, gi, many && new Set(gi.map(x => x.m)).size > 1, block));
        blocks.push(block);
      }
    }
    // drawn up to the focused item (?item=), so a deep link to the 800th joker still lands on it
    const at = focus ? mmSlotIndex(slots, x => x.it.key === focus) : -1;
    pager = mmPager(slots, at + 1, () => mmOn(cid));
    body.replaceChildren(...(blocks.length ? [...blocks, pager.foot] : [h('p', { class: 'muted' }, 'Nothing matches.')]));
    pager.start();
    count.replaceChildren(String(shown.length), h('span', null, ' of ' + (tabs ? all.filter(x => x.sid === st.type).length : all.length) + ' entries'));
  };
  const search = h('input', { type: 'search', class: 'mc-search', placeholder: 'Search ' + C.title.toLowerCase() + ' (name or text)…', value: st.q, autocomplete: 'off' });
  search.oninput = () => { st.q = search.value; sync(); draw(); };
  const modSel = h('select', { class: 'adv-select mc-select mm-modsel', 'aria-label': 'Filter by mod' },
    h('option', { value: 'all', selected: st.mod === 'all' ? '' : null }, 'All mods (' + mods.length + ')'),
    mods.map(m => h('option', { value: m.id, selected: st.mod === m.id ? '' : null }, m.name + ' (' + C.perMod[m.id] + ')')));
  modSel.onchange = () => { st.mod = modSel.value; sync(); draw(); };
  const rarSel = rarities.length ? h('select', { class: 'adv-select mc-select', 'aria-label': 'Filter by rarity' },
    h('option', { value: 'all', selected: st.rarity === 'all' ? '' : null }, 'All rarities'),
    rarities.map(r => h('option', { value: r, selected: st.rarity === r ? '' : null }, r))) : null;
  if (rarSel) rarSel.onchange = () => { st.rarity = rarSel.value; sync(); draw(); };
  mcPut(mmBack(),
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, C.title), h('p', { class: 'muted' }, C.blurb + ' From ' + mcPlural(mods.length, 'mod', 'mods') + '; each card’s badge links to its mod’s page, and the text is the game’s own.')),
      count),
    h('div', { class: 'mc-filters' }, search, modSel, rarSel),
    bar, body);
  draw(hit ? want : null);
  if (hit) {
    const el = document.getElementById('mc-' + want);
    if (el) { el.classList.add('mc-hl'); el.scrollIntoView({ block: 'center' }); }
  }
}

function micatroModsRoute(sub, id) {
  if (!sub) return micatroModsView();
  if (sub === 'mod') {
    const nd = document.getElementById('navMods'); if (nd && id) nd.open = true; // (the sidebar's By-mod list shows where you are)
    return id ? micatroModView(id) : (location.replace(MM), undefined);
  }
  return micatroModsCategoryView(sub);
}

// ---------- the header search box, wiki-wide (#/search?q=) ----------
// On the list pages (Pokédex, moves, cards, ...) the box filters that list; anywhere else it opens
// #/search: Pokémon, moves, abilities, Micatro's own cards and every Micatro mod's, by name (then text).
let mcSearchIndex = null;
function micatroSearchIndex() {
  if (mcSearchIndex) return mcSearchIndex;
  const V = { jokers: 'jokers', tarots: 'consumables', planets: 'consumables', spectrals: 'consumables', vouchers: 'vouchers', boosters: 'boosters', tags: 'tags', blinds: 'blinds', decks: 'decks', stakes: 'stakes', hands: 'hands', enhancements: 'enhancements', editions: 'enhancements', seals: 'enhancements', stickers: 'enhancements', challenges: 'challenges' };
  const KIND = { jokers: 'Joker', tarots: 'Tarot', planets: 'Planet', spectrals: 'Spectral', vouchers: 'Voucher', boosters: 'Booster Pack', tags: 'Tag', blinds: 'Blind', decks: 'Deck', stakes: 'Stake', hands: 'Poker Hand', enhancements: 'Enhancement', editions: 'Edition', seals: 'Seal', stickers: 'Sticker', challenges: 'Challenge' };
  const vanilla = loadMicatro().then(D => Object.entries(V).flatMap(([k, page]) => (D[k] || []).map(it => {
    const key = k === 'hands' ? it.name : it.key;
    return { name: it.name, text: (it.lines || []).join(' ').replace(/\{[^}]*\}/g, ''), kind: KIND[k], href: '#/micatro/' + page + '?item=' + encodeURIComponent(key) };
  }))).catch(() => []);
  // every mod item from designwiki/data/micatro_mods_search.json (key, name, mod, category, kind, text:
  // ~250 KB instead of the 19 mod files); the category page a result links to loads the full mod file
  const mods = fetch('data/micatro_mods_search.json' + CB).then(r => { if (!r.ok) throw new Error('micatro_mods_search.json ' + r.status); return r.json(); })
    .then(S => S.items.map(([key, name, mi, ci, ki, text]) => ({
      name, text, kind: S.kinds[ki], mod: S.mods[mi][1], href: MM + '/' + (S.cats[ci] || 'other') + '?item=' + encodeURIComponent(key),
    }))).catch(() => []);
  return (mcSearchIndex = Promise.all([vanilla, mods]));
}
/** Name starts with q > a word of the name does > the name contains it > the text does. */
const searchLc = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function searchRank(name, text, q) {
  const n = searchLc(name);
  if (n.startsWith(q)) return 0;
  if (n.split(/[^a-z0-9]+/).some(w => w.startsWith(q))) return 1;
  if (n.includes(q) || (norm(q) && norm(n).includes(norm(q)))) return 2;
  return text && searchLc(text).includes(q) ? 3 : -1;
}
let searchSeq = 0;
async function globalSearchView() {
  const raw = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
  if (document.activeElement !== searchEl && searchEl.value !== raw) searchEl.value = raw;
  const q = searchLc(raw).trim();
  const seq = ++searchSeq;
  if (!q) return content.replaceChildren(h('h1', null, 'Search'), h('p', { class: 'muted' }, 'Type in the search box above: Pokémon, moves, abilities, Micatro cards and every Micatro mod’s cards.'));
  content.replaceChildren(h('h1', null, 'Search'), h('p', { class: 'muted' }, 'Searching…'));
  const rank = (list, nameOf, textOf) => list.map(x => [searchRank(nameOf(x), textOf ? textOf(x) : '', q), x]).filter(r => r[0] >= 0).sort((a, b) => a[0] - b[0] || String(nameOf(a[1])).localeCompare(String(nameOf(b[1])))).map(r => r[1]);
  const pk = rank(Object.values(DB.pokemon || {}), p => p.name);
  const mv = rank(Object.values(DB.moves || {}), m => m.name);
  const ab = rank(Object.values(DB.abilities || {}), a => a.name);
  const [van, mod] = await micatroSearchIndex();
  if (seq !== searchSeq || (location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'search') return;
  const mcV = rank(van, x => x.name, x => x.text), mcM = rank(mod, x => x.name, x => x.text);
  const LIMIT = 60;
  const group = (title, id, list, row) => list.length ? h('section', { class: 'lp-tier search-group', 'data-group': id },
    h('div', { class: 'lp-tier-head' }, h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + list.length + ')'))),
    h('ul', { class: 'search-list' }, list.slice(0, LIMIT).map(row)),
    list.length > LIMIT ? h('p', { class: 'muted' }, 'Showing the first ' + LIMIT + ' — type more to narrow it.') : null) : null;
  const li = (href, name, ...meta) => h('li', null, h('a', { href }, name), meta.filter(Boolean).length ? h('span', { class: 'search-meta' }, ' · ' + meta.filter(Boolean).join(' · ')) : null);
  const groups = [
    group('Pokémon', 'pokemon', pk, p => li('#/pokemon/' + p.id, p.name)),
    group('Moves', 'moves', mv, m => li('#/moves/' + m.id, m.name)),
    group('Abilities', 'abilities', ab, a => li('#/abilities/' + a.id, a.name)),
    group('Micatro', 'micatro', mcV, x => li(x.href, x.name, x.kind)),
    group('Micatro Mods', 'micatro-mods', mcM, x => li(x.href, x.name, x.kind, x.mod)),
  ].filter(Boolean);
  const n = pk.length + mv.length + ab.length + mcV.length + mcM.length;
  mcPut(h('div', { class: 'gallery-heading' }, h('div', null, h('h1', null, 'Search: “' + raw.trim() + '”'), h('p', { class: 'muted' }, 'Battlecards have their own search on the ', h('a', { href: '#/cards?q=' + encodeURIComponent(raw.trim()) }, 'Card Gallery'), '.')),
    h('div', { class: 'result-count' }, String(n), h('span', null, ' results'))),
    ...(groups.length ? groups : [h('p', { class: 'muted' }, 'Nothing matches.')]));
}

let mcModQ = '', mcModQId = null;
async function micatroModView(id) {
  if (mcModQId !== id) { mcModQ = ''; mcModQId = id; } // the search box belongs to one mod page
  content.replaceChildren(h('h1', null, 'Micatro mod'), h('p', { class: 'muted' }, 'Loading…'));
  let D, M;
  try { [D, M] = await Promise.all([loadMicatroMods(), loadMicatroMod(id)]); } catch (e) { if (mmOn('mod', id)) notFound(); return; }
  if (!mmOn('mod', id)) return;
  const m = D.mods.find(x => x.id === id);
  if (!m) return notFound();
  const nameOf = r => (D.mods.find(x => x.id === r) || { name: r }).name;
  const dependents = D.mods.filter(x => x.requires.includes(id));
  const catOf = mmCatOf(D), catTitle = Object.fromEntries((D.categories || []).map(c => [c.id, c.title]));
  const body = h('div');
  const count = h('div', { class: 'result-count' });
  const total = M.sections.reduce((n, s) => n + s.items.length, 0);
  let pagers = [];
  const draw = (focus) => {
    const q = mcModQ.trim().toLowerCase();
    const match = it => !q || (it.name + ' ' + (it.lines || []).join(' ') + ' ' + (it.badges || []).map(b => b.label).join(' ')).replace(/\{[^}]*\}/g, '').toLowerCase().includes(q);
    let shown = 0;
    for (const p of pagers) p.stop();
    pagers = [];
    body.replaceChildren(...M.sections.map(s => {
      const items = s.items.filter(match);
      shown += items.length;
      if (!items.length) return null;
      const list = h('div', { class: s.kind === 'row' ? 'mc-rows' : s.kind === 'hand' ? 'mc-hands' : 'mc-grid' });
      const one = { wrap: list, items, draw: s.kind === 'row' ? x => mcModRow(x) : s.kind === 'hand' ? x => mcModHand(x) : x => mcModTile(x) };
      const pager = mmPager([one], focus ? items.findIndex(x => x.key === focus) + 1 : 0, () => mmOn('mod', id));
      pagers.push(pager);
      return h('section', { class: 'lp-tier', id: 'mcs-' + s.id, 'data-section': s.id },
        h('div', { class: 'lp-tier-head' }, h('h2', null, s.title, ' ', h('span', { class: 'num' }, '(' + (q ? items.length + ' of ' : '') + s.items.length + ')')), s.blurb ? h('p', { class: 'muted' }, s.blurb) : null,
          catOf[s.id] && D.mods.filter(x => (D.categories.find(c => c.id === catOf[s.id]) || { perMod: {} }).perMod[x.id]).length > 1
            ? h('p', { class: 'mm-catlink' }, h('a', { href: MM + '/' + catOf[s.id] }, 'Every mod’s ' + catTitle[catOf[s.id]] + ' →')) : null), list, pager.foot);
    }));
    for (const p of pagers) p.start();
    if (!shown) body.replaceChildren(h('p', { class: 'muted' }, 'Nothing matches.'));
    count.replaceChildren(String(shown), h('span', null, ' of ' + total + ' entries'));
  };
  const search = h('input', { type: 'search', class: 'mc-search', placeholder: 'Search ' + m.name + ' (name or text)…', value: mcModQ, autocomplete: 'off' });
  search.oninput = () => { mcModQ = search.value; draw(); };
  const jump = h('div', { class: 'mc-jump' }, M.sections.map(s => h('button', { type: 'button', class: 'mc-jumpbtn', onclick: () => { const el = document.getElementById('mcs-' + s.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, s.title + ' ', h('b', null, s.items.length))));
  const fixes = m.fixes || [];
  const optRows = (m.options || []).map(o => h('tr', null, h('td', null, h('b', null, o.label), o.desc ? h('div', { class: 'mc-note mc-left' }, o.desc) : null),
    h('td', null, o.type === 'bool' ? (o.default ? 'On' : 'Off') : String(o.default))));
  mcPut(mcModBack(),
    h('div', { class: 'mc-hero mc-modhero', style: m.badge ? 'border-left:6px solid ' + m.badge : null },
      h('div', null,
        h('h1', null, m.name, m.version ? h('span', { class: 'num' }, ' v' + m.version) : null),
        h('p', { class: 'mc-by' }, 'By ', h('b', null, m.by)),
        h('p', null, m.description),
        h('p', null, h('a', { class: 'mc-play', href: '/micatro/' }, '▶ Play Micatro'), ' ', h('span', { class: 'muted' }, 'New Run → Mods → ' + m.name))),
      m.cover ? h('div', { class: 'mc-hero-art' }, mcSprite(m.cover.art.filter(l => MC_ATLAS[l[0]]), null, 1, m.name)) : null),
    jump,
    mcSection('About this mod', null, h('ul', { class: 'mc-list' },
      h('li', null, h('b', null, 'Credits. '), 'The original Balatro mod is by ', h('b', null, m.by.replace(/\s*\(rebuilt for Micatro\)\s*$/, '')), '. Micatro’s version is a native rebuild of it — same cards, numbers, rules and art, written for Micatro’s engine instead of loaded through Steamodded.'),
      h('li', null, h('b', null, 'Turning it on. '), 'New Run → ', h('b', null, 'Mods'), ' → ', m.name, '. It is off by default and lasts for that run only; off means gone (no cards, rules or art).',
        m.requires.length ? [' It needs ', m.requires.map((r, i) => [i ? ', ' : '', h('a', { href: '#/micatro-mods/mod/' + r }, nameOf(r))]), ', which switches on with it.'] : null,
        dependents.length ? [' Add-ons for it: ', dependents.map((x, i) => [i ? ', ' : '', h('a', { href: '#/micatro-mods/mod/' + x.id }, x.name)]), '.'] : null,
        m.optional.length ? [' Extra cards appear when it is combined with ', m.optional.map((r, i) => [i ? ', ' : '', h('a', { href: '#/micatro-mods/mod/' + r }, nameOf(r))]), '.'] : null),
      m.size ? h('li', null, h('b', null, 'Download. '), m.size + ', fetched only when a run turns it on.') : null,
      m.unported ? h('li', null, h('b', null, 'Not in pools. '), mcPlural(m.unported, 'card the original registers is', 'cards the original registers are'), ' disabled there and stay out of Micatro’s pools too.') : null)),
    m.systems.length ? mcSection('What it adds', null, h('ul', { class: 'mc-list' }, m.systems.map(s => h('li', null, s)))) : null,
    optRows.length ? mcSection('Options', 'Set per run in the Mods panel. Defaults are the mod’s own shipped config.',
      h('div', { class: 'mc-scroll mc-opts' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Option'), h('th', null, 'Default'))), h('tbody', null, optRows)))) : null,
    fixes.length ? mcSection('Fixed as the author intended', 'Bugs in the shipped mod that Micatro fixes the way its text and author meant (each pinned by a regression test). From the rebuild’s source notes.',
      h('details', { class: 'mc-fixes', open: fixes.length <= 8 ? '' : null },
        h('summary', null, mcPlural(fixes.length, 'fix', 'fixes')),
        h('ol', { class: 'mc-list' }, fixes.map(f => h('li', null, f.text, ' ', h('span', { class: 'mc-file' }, f.file)))))) : null,
    m.notPorted ? mcSection('Left out', null, h('p', { class: 'muted mc-left' }, m.notPorted)) : null,
    h('div', { class: 'gallery-heading mc-modcontent' }, h('div', null, h('h2', null, 'Content'), h('p', { class: 'muted' }, 'Every card the mod adds, with its base values (the text is the game’s own).')), count),
    h('div', { class: 'mc-filters' }, search),
    body);
  const want = mcHashParam('item');
  draw(want);
  if (want) {
    const el = document.getElementById('mc-' + want);
    if (el) { el.classList.add('mc-hl'); el.scrollIntoView({ block: 'center' }); }
  }
}

async function mcFeatureData(title, sub) {
  content.replaceChildren(h('h1', null, title), h('p', { class: 'muted' }, 'Loading…'));
  try { const D = await loadMicatroMods(); return mcOn(sub) ? D.features : null; }
  catch (e) { content.replaceChildren(h('h1', null, title), h('p', { class: 'muted' }, 'Could not load the Micatro data.')); return null; }
}
const mcTable = (head, rows) => h('div', { class: 'mc-scroll' }, h('table', null, h('thead', null, h('tr', null, head.map(c => h('th', null, c)))), h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, c)))))));

async function micatroBigNumbersView() {
  const F = await mcFeatureData('Big-number scoring', 'big-numbers'); if (!F) return;
  const B = F.bignum;
  mcPut(mcBack(),
    mcHead('Big-number scoring', null, null, 'Scores past Balatro’s limit — in every run, vanilla or modded.'),
    mcSection('What it does', null, h('ul', { class: 'mc-list' },
      h('li', null, 'Balatro keeps the score in an ordinary floating-point number, which runs out at about 1.8e308: past that the score becomes infinity and the game shows ', h('b', null, 'naneinf'), '.'),
      h('li', null, 'Micatro keeps going. Chips, Mult, hand scores, the round score and Blind targets can all reach ', h('b', null, '9.99e' + (B.maxExp - 1)), '. Only at 1e' + B.maxExp + ' does a score become infinity (“naneinf”).'),
      h('li', null, 'It is built into the base game, not a mod: it replaces the InfiniteScore / Talisman mods Balatro players use. Scores below 1e308 are calculated exactly as before, so ordinary runs (and their replays) are unchanged.'),
      h('li', null, 'Big numbers are shown like Balatro shows large scores — 3 decimals and an exponent (', h('b', null, '1.234e450'), '). An exponent too long to fit is shortened again (', h('b', null, '1.000e1.234e43'), ').'),
      h('li', null, 'Saves, ', h('a', { href: '#/micatro/replays' }, 'replays'), ' and spectators keep the exact value. The leaderboard ranks a big score above every ordinary one, and naneinf above everything.'))),
    mcSection('How numbers are shown', 'Straight from the game’s own number formatter.',
      mcTable(['Value', 'Shown as', ''], B.examples.map(x => [x.value, h('b', null, x.shown), x.big ? h('span', { class: 'mc-pill' }, 'big number') : '']))),
    mcSection('Where it matters', null, h('p', null, 'Exponential builds — long X Mult stacks, retrigger chains, and mods with X Chips or ^Mult jokers such as ', h('a', { href: '#/micatro-mods/mod/morefluff' }, 'More Fluff'), ' — can pass 1e308, especially deep into Endless mode. Blind targets keep scaling with the Ante too, so the Endless climb goes on instead of stalling at naneinf.')));
}

async function micatroDeckEditorView() {
  const F = await mcFeatureData('Deck editor', 'deck-editor'); if (!F) return;
  const E = F.deckeditor;
  const range = p => p.min + ' – ' + p.max + (p.step ? ' (step ' + p.step + ')' : '');
  const kind = r => ({ bool: 'On / off', pct: 'Chance %', int: 'Number', num: 'Number' }[r.kind] || r.kind);
  mcPut(mcBack(),
    mcHead('Deck editor', null, null, 'Build your own deck — starting cards, money, slots, Jokers, Vouchers, bans and house rules — and play it, share it, or rank with it.'),
    mcSection('Using it', null, h('ul', { class: 'mc-list' },
      h('li', null, h('b', null, 'Where. '), 'New Run → ', h('b', null, 'Custom deck'), ' opens your Custom Decks: your saved decks plus built-in examples, each with Use / Edit / Copy / Share / Delete, and New deck / Import.'),
      h('li', null, h('b', null, 'The editor. '), 'Tabs: ', h('b', null, 'Deck'), ' (name, back art, starting numbers) · ', h('b', null, 'Cards'), ' (the starting deck: presets, add / duplicate / remove cards with rank, suit, enhancement, edition and seal) · ', h('b', null, 'Items'), ' (starting Jokers, consumables, Vouchers and Tags — mod cards too) · ', h('b', null, 'Bans'), ' · ', h('b', null, 'Rules'), ' (house rules, below) · ', h('b', null, 'Share'), '. Mouse, touch and controller all work.'),
      h('li', null, h('b', null, 'Saving & sharing. '), 'Decks are saved on your account when you are signed in (otherwise in this browser). Share copies an ', h('b', null, 'MCD1.'), ' code a friend can import.'),
      h('li', null, h('b', null, 'Runs. '), 'A custom deck is part of the run, so resume, ', h('a', { href: '#/micatro/replays' }, 'replays'), ' and spectating rebuild the very same run. Custom-deck runs rank on the leaderboard’s Modded tab. Every random rule uses the run’s seed, so a seeded custom run is repeatable.'),
      h('li', null, h('b', null, 'Origin. '), 'A rebuild of Nyoxide’s ', h('b', null, 'Deck Creator'), ' (1.2.2) mod as a built-in Micatro feature.'))),
    E.examples.length ? mcSection('Example decks', 'Shown in every player’s Custom Decks list.', h('div', { class: 'mc-rows' }, E.examples.map(x => h('div', { class: 'mc-row', 'data-key': x.id },
      h('div', { class: 'mc-row-body' }, h('div', { class: 'mc-nm' }, x.name, h('span', { class: 'mc-pill' }, 'by ' + x.by), x.mods.map(id => h('a', { class: 'mc-pill', href: '#/micatro-mods/mod/' + id }, id))),
        h('div', { class: 'mc-desc mc-left' }, x.desc, x.jokers.length ? [h('br'), 'Jokers: ', x.jokers.join(', ')] : null, x.vouchers.length ? [h('br'), 'Vouchers: ', x.vouchers.join(', ')] : null)))))) : null,
    mcSection('Starting numbers', 'The Deck tab. Defaults are a standard run’s.', E.params.flatMap(g => [h('h3', { class: 'mc-h3' }, g.group), mcTable(['Setting', 'Default', 'Range'], g.items.map(p => [p.label, String(p.default), range(p)]))])),
    mcSection('Starting deck presets', null, h('p', null, E.presets.join(' · '), '. Up to ' + E.limits.cards + ' cards.')),
    mcSection('House rules', 'The Rules tab: Deck Creator’s rule options, all off by default.', E.rules.flatMap(g => [h('h3', { class: 'mc-h3' }, g.group + ' (' + g.items.length + ')'), mcTable(['Rule', 'Type'], g.items.map(r => [r.label, kind(r)]))])),
    E.fixes.length ? mcSection('Fixed from Deck Creator', 'Options that did not work as labelled in the original, and work here.', h('ul', { class: 'mc-list' }, E.fixes.map(f => h('li', null, f)))) : null,
    mcSection('Not carried over', null, mcTable(['Deck Creator option', 'Why'], E.skipped.map(s => [s.key, s.why]))),
    mcSection('Limits', null, h('p', { class: 'muted' }, 'Name ' + E.limits.name + ' characters · description ' + E.limits.desc + ' · ' + E.limits.cards + ' cards · ' + E.limits.jokers + ' Jokers · ' + E.limits.consumables + ' consumables · ' + E.limits.vouchers + ' Vouchers · ' + E.limits.tags + ' Tags · ' + E.limits.bans + ' bans · ' + E.limits.mods + ' mods.')));
}

async function micatroReplaysView() {
  const F = await mcFeatureData('Replays', 'replays'); if (!F) return;
  const R = F.replays;
  mcPut(mcBack(),
    mcHead('Replays', null, null, 'Watch any finished run again, from the first blind to the last hand — yours or a friend’s.'),
    mcSection('What a replay is', null, h('ul', { class: 'mc-list' },
      h('li', null, 'Always a ', h('b', null, 'whole run'), ': from the first blind to the game over, the win, or the end of Endless — never a single round.'),
      h('li', null, 'Micatro is deterministic, so a replay is just the run’s recipe (seed, deck, stake, mods and their options, custom deck) plus every action you took. The game plays it back exactly like live play, and a replay costs only a few KB.'),
      h('li', null, 'Recorded automatically at the game over and at the win. A win you carry on into Endless is recorded again at its game over under the same link, so the link always shows the whole run.'))),
    mcSection('Finding replays', null, h('ul', { class: 'mc-list' },
      h('li', null, h('b', null, 'Main menu → Replays: '), 'your last ' + R.localMax + ' runs on this device (watch, copy link, delete).'),
      h('li', null, h('b', null, 'Game over / win screen: '), 'Watch replay, and (signed in) Copy replay link.'),
      h('li', null, h('b', null, 'Leaderboard: '), 'a ▶ on a row plays the run that set that score.'),
      h('li', null, h('b', null, 'Friends: '), 'watching a friend’s run that just ended offers “▶ Watch the full run”.'),
      h('li', null, h('b', null, 'Links: '), h('code', null, '/mr/<id>'), ' (short) or ', h('code', null, '/micatro/?replay=<id>'), '. Signed-in players’ replays are uploaded and kept for 30 days.'))),
    mcSection('Watching', null,
      mcTable(['Control', 'Does'], [
        ['⏮ / ⏭', 'Jump to the start / the end'],
        ['◀ / ▶ (step)', 'One action back / forward'],
        ['Play / pause', 'Play at 1×, 2× or 4× speed'],
        ['Scrubber', 'Drag anywhere; ticks mark each blind, ante marks and a star for the win'],
        [kbdList('Space'), 'Play / pause'],
        [kbdList('←', '→'), 'Step back / forward'],
        [kbdList('Home', 'End'), 'Start / end'],
        ['Controller', 'LB / RB step, Y play / pause; the bar’s buttons are reachable with the reticle'],
      ]),
      h('p', { class: 'muted' }, 'The bar tucks away while playing. At the end the replay checks itself against the recorded result: if the game has changed since the run was played, it says the replay was recorded on an older version and may play out differently.')),
    mcSection('Limits', null, h('p', { class: 'muted' }, 'Up to ' + R.actionsMax.toLocaleString('en-US') + ' actions and ' + Math.round(R.packedMax / 1000) + ' KB packed per run. Mods and custom decks load exactly as recorded.')));
}
const kbdList = (...k) => k.map((x, i) => [i ? ' / ' : '', h('kbd', null, x)]).flat();

/** ?item=<key> on a Micatro page: highlight that entry and scroll to it (the wiki search links here). */
function mcFocusItem() {
  const want = mcHashParam('item');
  if (!want) return;
  const el = content.querySelector('[data-key="' + CSS.escape(want) + '"]');
  if (el) { el.classList.add('mc-hl'); el.scrollIntoView({ block: 'center' }); }
}
function micatroRoute(sub, id) {
  if (sub === 'mods' || sub === 'mod') {
    // the mods moved to their own section (#/micatro-mods); old links (Magepunk News, bookmarks) still land
    const q = location.hash.includes('?') ? '?' + location.hash.split('?')[1] : '';
    location.replace('#/micatro-mods' + (sub === 'mod' && id ? '/mod/' + id : '') + q);
    return;
  }
  if (mcHashParam('item') && sub === 'jokers') { mcJokerQ = ''; mcJokerRarity = 'all'; }
  return Promise.resolve(micatroVanillaRoute(sub, id)).then(() => { if (mcStillOn(sub || '')) mcFocusItem(); });
}
function micatroVanillaRoute(sub) {
  switch (sub || '') {
    case 'challenges': return micatroChallengesView();
    case 'big-numbers': return micatroBigNumbersView();
    case 'deck-editor': return micatroDeckEditorView();
    case 'replays': return micatroReplaysView();
    case '': return micatroView();
    case 'jokers': return micatroJokersView();
    case 'consumables': return micatroConsumablesView();
    case 'vouchers': return micatroVouchersView();
    case 'boosters': return micatroBoostersView();
    case 'tags': return micatroTagsView();
    case 'blinds': return micatroBlindsView();
    case 'decks': return micatroDecksView();
    case 'stakes': return micatroStakesView();
    case 'hands': return micatroHandsView();
    case 'enhancements': return micatroEnhancementsView();
    default: return notFound();
  }
}

// ---------------------------------------------------------------- MicaSurvivor
// The PokéSurvivor port at /micasurvivor/ (Plans/MICASURVIVOR_PLAN.md). Reference data is
// generated from the game's own files: data/micasurvivor.json (tools/micasurvivor/gen_designwiki.mjs).
let micasurvivorPromise = null;
function loadMicasurvivor() {
  if (!micasurvivorPromise) micasurvivorPromise = fetch('data/micasurvivor.json' + CB).then(r => { if (!r.ok) throw new Error('micasurvivor.json ' + r.status); return r.json(); });
  return micasurvivorPromise;
}
const msType = t => typeChip(String(t).charAt(0).toUpperCase() + String(t).slice(1));
const msStillOn = sub => { const p = location.hash.slice(1).split('?')[0].split('/').filter(Boolean); return p[0] === 'micasurvivor' && (p[1] || '') === sub; };
const msBack = () => h('p', { class: 'lp-back' }, h('a', { href: '#/micasurvivor' }, '← MicaSurvivor'));
const msTable = (head, rows, cls) => h('table', { class: 'ms-table' + (cls ? ' ' + cls : '') },
  h('thead', null, h('tr', null, ...head.map(c => h('th', null, c)))),
  h('tbody', null, ...rows.map(r => h('tr', null, ...r.map(c => h('td', null, c))))));
async function msLoadOr(title, sub) {
  content.replaceChildren(h('h1', null, title), h('p', { class: 'muted' }, 'Loading…'));
  let D = null;
  try { D = await loadMicasurvivor(); } catch (e) { content.replaceChildren(h('h1', null, title), h('p', { class: 'muted' }, 'Could not load the MicaSurvivor data.')); return null; }
  return msStillOn(sub) ? D : null;
}

async function micasurvivorView() {
  const D = await msLoadOr('MicaSurvivor', ''); if (!D) return;
  const kbd = (...k) => k.map((x, i) => [i ? ' / ' : '', h('kbd', null, x)]).flat();
  const C = D.counts;
  content.replaceChildren(
    h('div', { class: 'mc-hero ms-hero' },
      h('div', null,
        h('h1', null, 'MicaSurvivor'),
        h('p', null, 'A bullet-heaven survival roguelike with ', h('b', null, C.pokemon + ' Pokémon'), ' in Mystery Dungeon sprites: you are one Pokémon against endless hordes. Your moves fire on their own — you walk, pick upgrades and survive as long as you can. Based on ', h('b', null, 'PokéSurvivor by JPTER78'), ', ported into Magepunk as-is.'),
        h('p', null, h('a', { class: 'mc-play ms-play', href: '/micasurvivor/' }, '▶ Play MicaSurvivor'), ' ', h('span', { class: 'muted' }, 'free — no ads, nothing to buy'))),
      h('img', { class: 'ms-hero-art', src: '../micasurvivor/icons/tile.png', alt: '', width: 96, height: 96 })),
    h('div', { class: 'lp-grid ms-index' }, [
      ['pokemon', 'Pokémon', C.pokemon + ' Pokémon · ' + C.starters + ' starters · ' + C.legendaries + ' legendaries · ' + C.abilities + ' abilities'],
      ['moves', 'Moves', C.moves + ' moves and their evolutions' + (C.zmoves ? ' · ' + C.zmoves + ' Z-moves' : '')],
      ['items', 'Items & Upgrades', C.items + ' held items · ' + C.upgrades + ' upgrades'],
    ].map(([k, label, n]) => h('a', { class: 'lp-tile ms-idx', href: '#/micasurvivor/' + k, 'data-cat': k }, h('span', { class: 'lp-name' }, label), h('span', { class: 'lp-count mc-wrap' }, n)))),
    mcSection('How to play', null,
      h('ul', { class: 'mc-list' },
        h('li', null, h('b', null, 'Your partner. '), 'A short personality test picks your partner from the ', h('a', { href: '#/micasurvivor/pokemon' }, C.starters + ' starters'), ' (or choose one yourself). Every Pokémon you own can be your partner later.'),
        h('li', null, h('b', null, 'A run. '), 'Walk around the dungeon; your active move attacks by itself. Defeated foes drop experience. Each level up offers three cards — a new ', h('a', { href: '#/micasurvivor/moves' }, 'move'), ', a level for one you have, or a stat boost. Up to four moves; only the active one fires (switch with 1–4 or Q / E).'),
        h('li', null, h('b', null, 'Evolving moves. '), 'A move at its top level evolves once you have also taken the stat it needs (Flamethrower + Reflexes → Overheat): far stronger.'),
        h('li', null, h('b', null, 'Bosses, chests and rifts. '), 'Strong bosses come at set times; chests hold ', h('a', { href: '#/micasurvivor/items' }, 'held items'), ' (one at a time); rifts open on a legendary or a type arena. Arceus judges long runs.'),
        h('li', null, h('b', null, 'Between runs. '), 'Runs pay Pokémonedas. Spend them on permanent ', h('a', { href: '#/micasurvivor/items' }, 'upgrades'), ' per Pokémon and on the ', h('b', null, 'gacha'), ' (9 regional banners, shinies) — all earned in play, never bought. Daily / weekly missions and achievements pay out too.'))),
    // MicaSurvivor M5 batch 6: the quick modes, the 6 modifiers and the level-up ban (micasurvivor/js/systems/modes.js)
    ...(D.modes ? [msModesSection(D.modes)] : []),
    // MicaSurvivor M5 batch 12b: online co-op with friends (micasurvivor/js/net/coop.js, js/mica/social.js, js/mica/online.js)
    ...(D.online ? [msOnlineSection(D.online)] : []),
    // MicaSurvivor M5 batch 12c: watching a friend live and run replays (micasurvivor/js/mica/spectate.js, js/mica/replay.js, js/ui/watch-ui.js)
    ...(D.spectate ? [msSpectateSection(D.spectate)] : []),
    // MicaSurvivor M5 batch 9: adaptive difficulty, biome spawns, support caps (micasurvivor/js/systems/adaptive.js, js/data/enemies.js)
    ...(D.difficulty ? [msDifficultySection(D.difficulty)] : []),
    // MicaSurvivor M5 batch 10: the minimap, the field of view and the UI scale (micasurvivor/js/core/display.js, js/ui/minimap.js)
    ...(D.display ? [msDisplaySection(D.display)] : []),
    // MicaSurvivor M5 batch 11: achievements, missions, titles, the damage breakdown, the Lexicon and the trainer card
    ...(D.goals ? [msGoalsSection(D.goals)] : []),
    mcSection('Getting there', null,
      h('ul', { class: 'mc-list' },
        h('li', null, h('b', null, 'Landing page: '), 'the MicaSurvivor tile on ', h('a', { href: '/' }, 'michaelgibalerio.com'), ' opens ', h('a', { href: '/micasurvivor/' }, '/micasurvivor/'), '.'),
        h('li', null, h('b', null, 'Overworld: '), 'the MICASURVIVOR arcade cabinet in the ', h('b', null, 'Pewter Museum'), ' lobby (Kanto), against the reception counter right of the entrance. Interact with it (A on a controller) and answer YES — your party and position are saved, and the game’s “Back to the overworld” link returns you beside the cabinet.'),
        h('li', null, h('b', null, 'Your account: '), 'logged into Magepunk, you play as your Magepunk user and your progress (collection, coins, upgrades, records) is saved to your account — on any device. Guests keep a save in their browser; the first time a guest logs in, the game offers once to bring that progress into the account.'),
        h('li', null, h('b', null, 'Leaderboard: '), 'the menu’s Leaderboard ranks logged-in players by their ', h('b', null, 'best survival time'), ' in a solo Normal run with no modifiers (ties: more foes defeated), with their level and partner. Runs under 2 minutes don’t count (nor do group runs, other modes or runs with modifiers).'),
        // MicaSurvivor M5 batch 12b: online co-op with friends
        h('li', null, h('b', null, 'Friends: '), 'with your Magepunk account, play online with up to 3 of your Magepunk friends (see Online co-op below). Guests are asked to sign in.'),
        // MicaSurvivor M5 batch 12c: watching a friend live, run replays
        h('li', null, h('b', null, 'Watching: '), 'a friend in a run shows as live (“Watch”) in MicaSurvivor’s Friends screen, the Battlecards “Live now” hub, the site’s top bar and the overworld friends menu; it opens ', h('code', null, '/micasurvivor/?watch=<username>'), '. A shared replay opens from its link for anyone, account or not (see Watching and replays below).'))),
    mcSection('Controls', 'Keyboard, mouse, touch and controller all work.',
      h('h3', { class: 'mc-h3' }, 'Keyboard'),
      msTable(['Key', 'Action'], [
        [kbd('W', 'A', 'S', 'D'), 'Move (or the arrow keys)'],
        [kbd('1', '…', '4'), 'Choose the active move'],
        [kbd('Q', 'E'), 'Previous / next move'],
        [kbd('1', '2', '3'), 'Pick a level-up card'],
        [kbd('R'), 'Reroll the level-up cards'],
        [kbd('B'), 'Ban a level-up card (with the Ban upgrade), then pick the new move to ban'],
        [kbd('Z'), 'Z-move (from level 15, once unlocked)'],
        [kbd('C'), 'Dynamax (from level 20, once a raid den is cleared)'],
        [kbd('Tab'), 'Team Mode: switch to the next Pokémon (otherwise: next move)'],
        [kbd('Esc', 'P'), 'Pause'],
      ]),
      h('h3', { class: 'mc-h3' }, 'Touch'),
      h('p', null, 'A virtual joystick (fixed or floating, three sizes) and on-screen move / pause buttons you can place anywhere (Settings → Controls). The game is played in landscape.'),
      h('h3', { class: 'mc-h3' }, 'Controller'),
      h('p', { class: 'muted' }, 'For everyone, guests included (no Magepunk sign-in needed). A second controller moves the partner in Co-op Mode. Design from the Android port by JayElDragon. Xbox, PlayStation and Nintendo layouts (Nintendo is the default, like the rest of the site: the right face button confirms); remap any action in Settings → Controls — binding a button another action used swaps the two.'),
      msTable(['Action', 'Xbox', 'PlayStation', 'Nintendo'], [
        ['Move', 'Left stick / D-pad', 'Left stick / D-pad', 'Left stick / D-pad'],
        ['Previous / next move, tabs, walk the cards', 'LB / RB', 'L1 / R1', 'L / R'],
        ['Pause / resume', 'Menu', 'Options', '+'],
        ['Confirm (the focused button / card)', 'A', '✕', 'A (right)'],
        ['Back / cancel', 'B', '○', 'B (bottom)'],
        ['Reroll the level-up cards', 'Y', '△', 'X'],
        ['Ban a level-up card (in a run it fires Dynamax)', 'X', '□', 'Y'],
        ['Z-move (in a run Y / △ / X and the right trigger also fire it)', 'LS (L3)', 'L3', 'LS'],
        ['Dynamax (in a run X / □ / Y and the left trigger also fire it)', 'View', 'Share', '−'],
        ['Switch Pokémon (Team Mode)', 'RS (R3)', 'R3', 'RS'],
      ])),
    mcSection('Credits & licence', null,
      h('ul', { class: 'mc-list' },
        h('li', null, h('b', null, 'Game: '), h('a', { href: 'https://github.com/JPTER78/pokesurvivor', target: '_blank', rel: 'noopener' }, 'PokéSurvivor by JPTER78'), ', code under the ', h('a', { href: '/micasurvivor/LICENSE-NONCOMMERCIAL.md' }, 'PolyForm Noncommercial License 1.0.0'), ' (versions before 14-10-2026: ', h('a', { href: '/micasurvivor/LICENSE' }, 'MIT'), '). ', h('code', null, 'Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)')),
        h('li', null, h('b', null, 'Non-commercial: '), 'MicaSurvivor never gets ads, paid items or anything sold — everything is earned by playing.'),
        h('li', null, h('b', null, 'Sprites: '), h('a', { href: 'https://github.com/PMDCollab/SpriteCollab', target: '_blank', rel: 'noopener' }, 'PMDCollab SpriteCollab'), ', CC BY-NC 4.0 — every artist is listed in the game’s Credits screen and ', h('a', { href: '/micasurvivor/CREDITS.md' }, 'CREDITS.md'), '.'),
        h('li', null, h('b', null, 'Controller design: '), h('a', { href: 'https://github.com/JayElDragon/poke-survivor', target: '_blank', rel: 'noopener' }, 'the Android port by JayElDragon'), ' (MIT).'),
        h('li', null, 'Pokémon © Nintendo / Creatures Inc. / GAME FREAK. A non-commercial fan project, not affiliated with them.'))));
}

// MicaSurvivor M5 batch 6: Game modes (from the Android port by JayElDragon; the numbers are the port's)
// MicaSurvivor M5 batch 12a: Co-op Mode (the Android port's local partner: the AI or a second controller on the same screen)
function msCoopText(C) {
  return 'A second Pokémon of yours comes along ("Choose partner" picks it; otherwise the first of your team who isn’t you, else ' + C.fallback + '). It attacks on its own with the first projectile move of its main type (else Ember), levelled 1 + your level / ' + C.lvEvery + ', every shot ×' + C.dmg + ' of YOUR attack — it shares your upgrades, items and Dynamax — on a ×' + C.cd + ' cooldown; its hits show as “Partner / team” after the run. '
    + 'The AI walks to you past ' + C.follow + ' units, closes in on an enemy within ' + C.seek + ' while you are within ' + C.engage + ', and reappears next to you if it falls ' + C.leash + ' behind. Plug in a second controller and player 2 moves it with the left stick (speed ' + C.speed + ', no buttons; player 1 keeps the menus); unplug it and the AI takes over. '
    + 'Enemies only go for you. When you fall (after any Second Chance heart) you spectate instead: the partner gets your max HP and takes your hits (×' + C.downK + '), and after ' + C.reviveT + ' s it revives you at ' + Math.round(C.reviveHp * 100) + ' % HP; if it falls first, the run is over. It is not in rifts. Modifiers apply; coins ×' + C.coins + ' (−' + Math.round((1 - C.coins) * 100) + ' %). A run of ' + C.groupMin + ' s or more counts for the “play in a group” achievements.';
}

function msModesSection(M) {
  const pct = v => Math.round(v * 100) + ' %', mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const N = Object.fromEntries(M.list.map(m => [m.id, m.name]));
  const rows = [
    [N.normal, 'The classic run, with any modifiers you switch on (+' + pct(M.coins.perMod) + ' coins each; a run with modifiers is not on the leaderboards).'],
    // MicaSurvivor M5 batch 8: Boss Rush (micasurvivor/js/systems/bossrush.js), in the port's menu order
    ...(M.rush && N.rush ? [[N.rush, 'Only bosses, one after another: the first after ' + M.rush.first + ' s, each next one ' + M.rush.rest + ' s after the last falls, with no waves in between. Every third boss is a legendary; the others are non-legendary Pokémon whose base stat total climbs (' + M.rush.bst.lo + ' + ' + M.rush.bst.step + ' per boss, up to ' + M.rush.bst.max + '). HP ' + M.rush.hp.base + ' × ' + M.rush.hp.grow + ' per boss (×' + M.rush.hp.k + '), damage ' + M.rush.dmg.base + ' + ' + M.rush.dmg.step + ' per boss (up to ' + M.rush.dmg.max + ', ×' + M.rush.dmg.k + '). Each boss leaves coins, an item, a healing berry and a magnet. The run starts in a random biome and changes biome every ' + M.rush.biome + ' s (never the Judgment ruins, Arceus’s arena); no rifts, events or Judgment. It ends when you fall: your record is the most bosses beaten. Modifiers apply; five achievements, two missions and the Bug Z-crystal reward it.']] : []),
    [N.daily, 'One run a day, the same for everyone: the date (YYYYMMDD) seeds the Pokémon you play (a non-legendary one, owned or not), one of the 6 modifiers as the day’s rule, the map, the enemies, the bosses and your starting moves. Coins ×' + M.coins.daily + ' (your own modifiers are not added). Your best time of the day is kept; replay it as often as you like.'],
    [N.party, 'Play any Pokémon (Pikachu until you pick another, owned or not). You cannot die (a lethal hit leaves 1 HP) and nothing is saved — no coins, records, missions, achievements, tickets or shinies, and it never reaches a leaderboard.'],
    // MicaSurvivor M5 batch 12a: Co-op Mode, the local partner (micasurvivor/js/systems/localcoop.js), in the port's menu order
    ...(M.coop && N.coop ? [[N.coop, msCoopText(M.coop)]] : []),
    // MicaSurvivor M5 batch 8: the Floor Tower (micasurvivor/js/systems/tower.js)
    ...(M.tower && N.tower ? [[N.tower, M.tower.floors + ' floors. Each floor is ' + M.tower.bossAt + ' s of waves, then its fixed boss (always the same one; a legendary every 5 floors, Eternatus on 25 and Arceus on 30, who has two bosses’ HP and a last breath at 25 %). Beat it to clear the floor. Tower enemies have ×' + M.tower.k.hp + ' HP and ×' + M.tower.k.dmg + ' damage, spawn ×' + M.tower.k.spawn + ' faster, bosses ×' + M.tower.k.bossHp + ' HP, and they grow with your upgrades (up to ' + (1 + M.tower.adapt.maxHp) + '× HP and +' + Math.round(M.tower.adapt.maxDmg * 100) + ' % damage); you level ×' + M.tower.k.xp + ' as fast. From floor 11 bosses bring escorts and surges grow. A first clear pays ' + M.tower.reward.map(r => 'floor ' + r.floor + ': ' + r.coins + ' coins, ' + r.t1 + ' ticket' + (r.t1 > 1 ? 's' : '') + (r.t10 ? ', ' + r.t10 + ' ×10' : '')).join(' · ') + '; floors ' + M.tower.bonds.join(' and ') + ' also give an attack bond. Every ' + M.tower.relic.every + ' floors cleared once earn a permanent relic (+' + M.tower.relic.hp + ' HP and +' + Math.round(M.tower.relic.atk * 100) + ' % attack in the Tower, up to ' + M.tower.relicsMax + ') and unlock a checkpoint: start on floor 6, 11, 16, 21 or 26 ("Starting floor") with a free level-up per floor skipped. Z-moves and Dynamax are off in the Tower. Modifiers apply; seven achievements, two missions and the Rock Z-crystal reward it.']] : []),
    [N.rifts, mmss(M.rifts.limit) + ' on the clock, counting down: the first rift check comes at ' + M.rifts.first + ' s, then every ' + M.rifts.every + ' s (' + M.rifts.after + ' s after a fight) and each one opens a rift unless a boss is alive; none in the last ' + M.rifts.last + ' s, and no Dynamax dens. Win as many legendary fights as you can — a fight still going at 8:00 is finished first. Coins +' + pct(M.coins.rifts) + '; your record of rifts won is kept.'],
    [N.type, 'Only Pokémon of the chosen type appear — the enemy waves, the 5 bosses and the raid dens (change the type on the mode screen). Coins +' + pct(M.coins.type) + '. Surviving ' + M.typeMin + ' minutes marks that type as beaten (achievements for 9 and all ' + M.types + ' types).'],
    // MicaSurvivor M5 batch 7: Team mode (micasurvivor/js/systems/team.js)
    ...(M.team && N.team ? [[N.team, 'Bring up to ' + M.team.max + ' of your Pokémon (unlocked once you own ' + M.team.minOwned + ') and swap them mid-run: Tab, R3 on a controller, the round swap button or a tap on a team card. "Choose team" picks them; any empty place is filled with your partner and the first Pokémon you got. A swap needs ' + M.team.cooldown + ' s since the last one and gives ' + M.team.inv + ' s of invulnerability. Each member keeps its own HP (benched ones recover ' + (M.team.regen * 100).toFixed(1) + ' % of their base HP a second); level, moves, items and max-HP gains are shared; type, speed, attack and ability are the active one’s, and a swap ends Dynamax. When the active one faints the next comes in at once (' + M.team.invAuto + ' s invulnerable) — after any Second Chance heart — and the run ends when all are down. Modifiers apply; three achievements and two missions reward it.']] : []),
  ];
  const T = M.tower;
  return mcSection('Game modes', 'Main menu → Game modes (mouse, touch or controller). Records and unlocks are saved to your account and merged safely across devices (the best of each record; the Daily’s best is kept per date; Tower floors cleared are combined and the higher checkpoint wins). Leaderboards only take Normal runs with no modifiers on. ' + (M.tower ? 'Thirty-five' : M.team ? 'Twenty-three' : 'Twenty') + ' achievements reward the modes (Missions → Achievements → Game modes).',
    msTable(['Mode', 'Rules'], rows.map(([a, b]) => [h('b', null, a), b]), 'ms-modes'),
    // MicaSurvivor M5 batch 8: the Tower's rest and its risk pacts (main.gd 223-247 / 3485-3532)
    ...(T ? [h('h3', { class: 'mc-h3' }, 'Floor Tower: rest and risk pacts'),
      h('p', null, 'After each floor, first rest — ' + T.rests.map(r => r.name).join(', ') + ': heal ' + pct(T.rest.heal) + ' of your HP (' + pct(T.rest.healLate) + ' after floor ' + T.rest.lateAfter + '), an extra level-up card, or a shield worth ' + pct(T.rest.shield) + ' of your HP for the next floor. Then up to three risk pacts (or No risks): each lasts the whole run, up to ' + T.maxRisks + '. With a ' + pct(T.legendChance) + ' chance a golden legendary card, with no cost, takes one card’s place. Pick with a click, a tap, the 1–4 keys or a controller (cancel = No risks).'),
      msTable(['Card', 'Kind', 'Effect'], T.risks.map(r => [h('b', null, r.name), 'Risk', r.desc]).concat(T.legends.map(r => [h('b', null, r.name), 'Legendary', r.desc])), 'ms-pacts')] : []),
    h('h3', { class: 'mc-h3' }, 'Modifiers'),
    h('p', null, 'Switch any of the six on for every mode but the Daily (which brings its own) and Party: each adds +' + pct(M.coins.perMod) + ' coins at the end. They apply to every enemy — waves, bosses, legendaries and dens.'),
    msTable(['Modifier', 'Effect'], M.mods.map(m => [h('b', null, m.name), m.desc]), 'ms-mods'),
    h('h3', { class: 'mc-h3' }, 'Banning a level-up card'),
    h('p', null, 'With the ' + M.ban.upgrade + ' upgrade (up to ' + M.ban.max + ' levels: ' + M.ban.costs.join(' · ') + ' coins) you get that many bans per run. On the level-up screen press Ban (the B key, or X / □ / Y on a controller), then pick a new-move card: that move never shows up again in the run and three fresh cards are dealt — free, it does not use a reroll. The same upgrade still lets you pre-ban moves in Upgrades.'));
}

// MicaSurvivor M5 batch 12b: online co-op with friends — upstream PokéSurvivor's 4-player group runs (WebRTC, the host
// runs the enemies), on Magepunk accounts; the numbers come from js/net/coop.js and server/mp.mjs (MSURV_*)
function msOnlineSection(O) {
  const pct = v => Math.round(v * 100) + ' %', kb = n => Math.round(n / 1000) + ' KB';
  const [play, ready, viaServer, signIn, leftEg, usedUp] = O.strings;
  return mcSection('Online co-op with friends', 'Up to ' + O.max + ' players over the internet, each on their own device: upstream PokéSurvivor’s group runs, on Magepunk accounts and friends.',
    h('h3', { class: 'mc-h3' }, 'Getting together'),
    h('ol', { class: 'mc-list' },
      h('li', null, 'Main menu → ', h('b', null, 'Friends'), ' → ', h('b', null, play), ' opens a lobby (or press Invite next to a friend). Your friends are your Magepunk friends; you can add one by username there. Guests see “' + signIn + '”: friends need an account.'),
      h('li', null, 'Invite friends who are online. A friend in MicaSurvivor gets a popup (in a solo run, a note to open the menu); anywhere else on Magepunk a message in their inbox bell. An invite lasts ' + Math.round(O.lobby.invite / 60) + ' minutes; only the host’s friends can join, checked by the server.'),
      h('li', null, 'The lobby shows each player’s Pokémon (Change Pokémon picks another), whether they are ready and how they are connected. Each guest presses “' + ready + '”; the host starts when everyone is — the same world for all.'),
      h('li', null, 'Mouse, touch and controller all work. A lobby whose host stops answering closes after ' + O.lobby.idle + ' s; a guest who stops answering in the lobby is dropped after ' + O.lobby.member + ' s.')),
    h('h3', { class: 'mc-h3' }, 'Rules (upstream’s)'),
    msTable(['Rule', 'How it works'], [
      [h('b', null, 'Who runs what'), 'The host runs the enemies, items on the ground, the team’s experience and level, the clock and the end of the run. Each player runs their own Pokémon (movement, HP, attacks); your hits on enemies are sent to the host, who applies them.'],
      [h('b', null, 'Mode'), 'Always a Normal run with no modifiers. Not Daily, Rush, Tower, Team, Co-op Mode (the local partner) or the other modes; adaptive difficulty is off. Group runs are not on the leaderboard.'],
      [h('b', null, 'More players, more foes'), msTableInline(O.scale)],
      [h('b', null, 'Experience and level'), 'Shared by the team: every gem counts for everyone, with the average of the players’ experience bonuses, divided as above (otherwise a group would level several times faster).'],
      [h('b', null, 'Level-up'), 'The cards come up for everyone at once and the run waits until every player has picked (“Waiting for …”). Who is still choosing rides on every message, so a lost message never leaves anyone stuck. A bond (fusion) choice pauses everyone the same way.'],
      [h('b', null, 'Falling'), 'A fallen player is revived by a partner standing next to them for ' + O.revive + ' s (back at 50 % HP). The run ends when everyone is down.'],
      [h('b', null, 'Pause'), 'Pausing does not stop the run for the others. If the host’s tab is hidden or silent for ' + O.stall + ' s, everyone waits for the host.'],
      [h('b', null, 'Rewards'), 'Each player earns their own coins and records from the team’s time, defeats, bosses and coins; every group run counts for “In good company” / “Loyal partner” and your best group time.'],
      [h('b', null, 'Leaving'), 'A guest who leaves (or closes the tab) is removed and the others go on. If the host leaves, the run ends for everyone, with their rewards saved; afterwards the lobby reopens.'],
    ], 'ms-online'),
    h('h3', { class: 'mc-h3' }, 'Connection'),
    h('p', null, 'Browsers connect directly to the host (WebRTC, like a video call: players can see each other’s IP address), negotiated through the Magepunk server and public STUN only. When two browsers can’t connect directly (some routers and mobile data), the pair falls back to a relay through the Magepunk server (“' + viaServer + '”): ' + O.rateRelay + ' update' + (O.rateRelay === 1 ? '' : 's') + ' a second instead of ' + O.rateDirect + ', so it is choppier (partners and enemies glide between updates). The relay is capped: one write every ' + O.relay.min + ' ms per player at most, ' + kb(O.relay.msg) + ' per message, ' + O.relay.window + ' unacknowledged messages and ' + kb(O.relay.row) + ' per player, and a player silent for ' + O.relay.stale + ' s is gone.'),
    // MicaSurvivor M5 batch 12b (owner, 2026-10-18: "slow relay + time cap")
    h('p', null, 'Each host gets ' + O.relay.daily + ' relay minutes per day (UTC), across all their lobbies: a minute counts once when anyone in the lobby used the relay during it. The lobby warns ahead while a pair is on the relay (“' + leftEg + '”). When they run out: “' + usedUp + '” A relayed guest’s run ends with its rewards saved and the host carries on; pairs connected directly are not affected.'));
}
// MicaSurvivor M5 batch 12c: watching a friend live and shareable run replays; the numbers come from
// js/mica/spectate.js, js/mica/replay.js and server/mp.mjs (MSURV_* / SPEC_*)
function msSpectateSection(S) {
  const R = S.replay, kb = n => Math.round(n / 1000) + ' KB';
  const [watching, live, leave, liveNow, share, watchReplay, copied, choosing, again] = S.strings;
  return mcSection('Watching and replays', 'Watch a friend’s run as it happens, and share a whole run as a replay anyone can open. Read-only: nothing a viewer presses reaches the run.',
    msTable(['', 'How it works'], [
      [h('b', null, 'Watch a friend'), 'Friends only, both ways (checked by the server). A friend in a run is listed under “' + liveNow + '” in MicaSurvivor’s Friends screen (and as live on the rest of Magepunk); “Watch” opens their run on your screen: “' + watching + ' … ' + live + '”, with “' + leave + '” (or Esc) back to the menu.'],
      [h('b', null, 'What you see'), 'The game’s own view of their run: their Pokémon (position, facing, animation, HP, level and XP, moves, held items), the foes within ' + S.near + ' px (bosses within ' + S.bossNear + ', up to ' + S.maxEnemies + '), the pickups, the clock, biome, rift arena and mode, the HUD and minimap, their co-op partners (online or the local one, with its HP), their Z-move / Dynamax state, and when they are choosing (“' + choosing + '”). Their attacks are drawn as harmless copies.'],
      [h('b', null, 'Smoothness'), 'A snapshot comes about every ' + S.publish + ' s; everything glides between the last two, so the view runs about a second behind.'],
      [h('b', null, 'Cost'), 'Nothing is sent while nobody watches: the player’s game only checks for watchers every ' + S.check + ' s, and the server keeps a small “in a run” note refreshed every ' + S.beacon + ' minutes (it lapses after ' + S.live + ' minutes without one). While someone watches, one snapshot (at most ' + kb(S.snapshot) + ') a second; each viewer checks in every ' + S.heartbeat + ' s and counts as watching for ' + S.window + ' s. Past ' + S.daily + ' watched minutes a day (UTC), one snapshot every ' + S.slow + ' s. At most ' + S.cap + ' viewers per run.'],
      [h('b', null, 'Co-op groups'), 'Every member of an online group publishes their own view, so a group can be watched through any member; the live list names the group.'],
      [h('b', null, 'Replays'), 'Every run is recorded as it goes (a snapshot every ' + R.every + ' s of run time, positions to ' + R.quantum + ' px, only what changed, plus the level-ups, cards picked, bosses, Z-moves, Dynamax and the faint), without changing the run. The last ' + R.local + ' runs are kept in your browser.'],
      [h('b', null, 'Sharing'), 'The run summary’s “' + share + '” uploads it and copies a short link (/msr/<id>: “' + copied + '”); “' + watchReplay + '” plays it right there. If the upload fails it stays in your browser to retry (also from Friends → your recent runs). Up to ' + kb(R.max) + ' packed (gzip), ' + R.frames.toLocaleString('en') + ' frames; each player keeps their ' + R.perUser + ' latest shared replays, each for ' + R.days + ' days. Opening a link needs no account.'],
      [h('b', null, 'The player'), 'Play / pause (Space), speed 1× · 2× · 4×, a seek bar with marks for bosses, Z-moves and Dynamax, and the run’s summary at the end (“' + again + '”).'],
    ], 'ms-spectate'));
}
function msTableInline(rows) {
  return h('span', null, rows.filter(r => r.players > 1).map(r => r.players + ' players: foes appear ×' + r.spawn + ', enemy HP ×' + r.hp + ', experience ×' + r.xp).join(' · ') + ' (bosses also ×1.4 HP in a group).');
}

// MicaSurvivor M5 batch 9: adaptive difficulty, biome-themed spawns and the support caps (from the Android port by
// JayElDragon; the numbers are the port's)
function msDifficultySection(D) {
  const A = D.adaptive, S = D.support, pct = v => Math.round(v * 100) + ' %';
  return mcSection('Difficulty and biomes', 'How a normal run adapts to you, which Pokémon each biome favours, and the limits on support Pokémon.',
    h('h3', { class: 'mc-h3' }, A.setting),
    h('p', null, 'Normal runs only (not the Daily Challenge, which is the same for everyone, nor the other modes, nor inside a rift). The game starts easy and gets harder as you grow. Your power is your stat cards plus your move levels (+' + A.evo + ' per evolved move) plus half your level; your Pokémon’s permanent upgrades set the base (0 to ' + A.permFull + '). The challenge is ' + A.base + ' + ' + A.perm + ' × base + (' + A.push + ' + ' + A.pushPerm + ' × base) × power (power counts up to ' + A.powerFull + '), from ' + pct(A.min) + ' to ' + pct(A.max) + '; your first ' + A.newRuns + ' runs are easier still (×' + A.newK + ' rising to ×1).'),
    h('p', null, 'Every ' + A.every + ' s without a boss alive it checks how you are doing: losing more than ' + pct(A.hurtHi) + ' of your HP (or being under ' + pct(A.lowHp) + ') eases it by ' + A.down + '; losing under ' + pct(A.hurtLo) + ' raises it by ' + A.up + ' (in all, between ' + A.adjMin + ' and +' + A.adjMax + '). It moves towards its target by ' + A.glide + ' a second. It multiplies enemy and boss HP (×challenge), their damage (×challenge^' + A.dmgExp + '), how many enemies appear and how often hordes come, and the experience each level needs (×challenge^' + A.xpExp + '). Coins and records are not affected. It shows as “Challenge: N%” under the clock (green below 100 %, gold at 100 %, orange above) and can be switched off in Settings → Graphics (saved to your account).'),
    h('h3', { class: 'mc-h3' }, 'Biome-themed spawns'),
    h('p', null, 'Each biome favours its own Pokémon: in the run’s enemy cast those that fit the biome appear ×' + D.mul + ' as often, and every tier adds ' + D.extra + ' extra Pokémon of the biome (its own Pokémon first, then its types; never a support Pokémon, and plain attackers only in the first tier), also ×' + D.mul + '. The ' + D.arenas + ' rift-arena biomes favour their own type. If a tier has no Pokémon of the biome, the cast spawns as usual. In Survival by Type the chosen type wins; the Tower themes each floor by its biome. Weather follows the biome too.'),
    msTable(['Biome', 'Types', 'Its own Pokémon'], D.biomes.map(b => [h('b', null, b.name), h('span', null, b.types.map(msType)), b.dex.length ? b.dex.join(', ') : '—']), 'ms-biomes'),
    h('h3', { class: 'mc-h3' }, 'Support Pokémon caps'),
    msTable(['Support', 'Limit'], [
      [h('b', null, 'Healer'), 'Heals nearby foes for 7 % of their HP; with more than ' + S.healers + ' healers alive each heals ×' + S.healerK + '.'],
      [h('b', null, 'Shielder'), 'Every ' + S.shieldCd + ' s shields up to ' + S.shieldMax + ' foes within ' + S.shieldR + ' px for ' + pct(S.shieldK) + ' of their HP, lasting ' + S.shieldT + ' s; the same foe cannot get another shield for ' + S.shieldLock + ' s.'],
      [h('b', null, 'Summoner'), 'Calls ' + S.perCast + ' of its pack at a time; it stops calling with ' + S.perSummoner + ' of its own alive, and the map never holds more than ' + S.minions + ' summoned Pokémon (none at all when more than ' + S.capPad + ' foes over the cap are out).'],
      [h('b', null, 'Everywhere'), 'Each tier’s cast has one support Pokémon; biome extras and hordes never bring one.'],
    ], 'ms-support'));
}

// MicaSurvivor M5 batch 10: the minimap, the field-of-view slider and the UI scale (from the Android port by JayElDragon)
function msDisplaySection(D) {
  const F = D.fov, U = D.ui, M = D.minimap;
  return mcSection('Display', 'Three display settings from the Android port, in Settings → Graphics → Display. They belong to the device (saved in the browser, not the account).',
    msTable(['Setting', 'Range', 'What it does'], [
      [h('b', null, M.name), 'On / off (on)', M.desc + ' Round, ' + M.size + ' px across on a 720 px tall screen (proportionally smaller on a phone), ' + M.tiles + ' tiles wide. Explored ground stays drawn (dimmed); you see everything within ' + M.sight + ' tiles. Chests, altars and springs within ' + M.radar + ' tiles (or already explored), traps within ' + M.traps + ', enemies within ' + M.foes + '; bosses and the rift always, pinned to the rim when far. It sits under your HP and moves to the next free spot so it never covers the HUD. Hidden in the rift arena, during Arceus’s Judgment and on the card and pause screens.'],
      [h('b', null, F.name), F.min + '–' + F.max + ' % in steps of ' + F.step + ' (' + F.def + ' %)', 'The camera zoom, applied live (also on the pause screen). Lower shows more of the world: at ' + F.def + ' % the view is ' + F.viewW + ' world px across, at ' + F.min + ' % about ' + Math.round(F.viewW * F.def / F.min) + '. Dynamax and the Tower keep it. On a small screen (a phone) it never goes below ' + F.phoneMin + ' %.'],
      [h('b', null, U.name), U.min + '–' + U.max + ' % in steps of ' + U.step + ' (' + U.def + ' %)', 'Scales the in-run HUD and every menu and button together, with a Reset button. It goes only as large as the screen allows (so nothing is cut off) and, with a touch screen, no smaller than ' + U.touchMin + ' %; on-screen buttons keep their full touch area.'],
    ], 'ms-display'));
}

// MicaSurvivor M5 batch 11: achievements, missions and titles, the run damage breakdown, the in-game encyclopedia
// ("Lexicon") and the trainer card (from the Android port by JayElDragon; the lists and rewards are the port's)
function msGoalsSection(D) {
  const A = D.achievements;
  const rw = r => [r.coins ? r.coins.toLocaleString('en') + ' coins' : '', r.t1 ? r.t1 + ' ticket' + (r.t1 > 1 ? 's' : '') : '', r.t10 ? r.t10 + ' ×10 ticket' + (r.t10 > 1 ? 's' : '') : ''].filter(Boolean).join(' + ');
  const daily = D.missions.filter(m => m.period === 'daily'), weekly = D.missions.filter(m => m.period === 'weekly');
  return mcSection('Goals, titles, Lexicon and trainer card', 'Missions → Missions / Achievements / Titles / Profile, and Lexicon on the main menu (mouse, touch or controller). Every reward is coins or gacha tickets earned in play; achievements, titles and records are saved to your account and merged safely across devices.',
    h('h3', { class: 'mc-h3' }, 'Achievements'),
    h('p', null, A.total + ' achievements in ' + A.cats.length + ' categories, each with a bronze, silver or gold medal and a reward when you get it; some also give a title. "By type" has three per type (defeat 250 / 1,000 / 5,000 Pokémon of that type; a dual-type Pokémon counts for both), and "Legendaries" one per legendary beaten in a rift.'),
    msTable(['Category', 'Achievements', 'Titles'], A.cats.map(c => [h('b', null, c.name), String(c.count), String(c.titles)]), 'ms-achcats'),
    msTable(['Achievement', 'Goal', 'Reward'], [
      ...A.bosses.map(b => [h('b', null, b.name), 'Defeat ' + b.goal.toLocaleString('en') + ' boss' + (b.goal > 1 ? 'es' : ''), rw(b.reward) + (b.title ? ' · title “' + b.title + '”' : '')]),
      ...A.byType.map(t => [h('b', null, t.name), 'Defeat ' + t.goal.toLocaleString('en') + ' X-type Pokémon (each of the 18 types)', rw(t.reward)]),
    ], 'ms-achboss'),
    h('h3', { class: 'mc-h3' }, 'Missions'),
    h('p', null, 'Every day ' + 3 + ' daily missions and every week ' + 2 + ' weekly ones are drawn from these lists (the same for your account on every device; one daily can be swapped a day). Where a mission has several goals, one is drawn. Mode missions count only runs of that mode; the modifier ones count any run with that many modifiers (the Daily Challenge’s rule is not a modifier). Claim the reward on the Missions tab.'),
    msTable(['Daily mission', 'Reward'], daily.map(m => [m.random ? m.text.replace('Fire-type', 'X-type') + ' (type drawn at random)' : m.text, rw(m.reward)]), 'ms-daily'),
    msTable(['Weekly mission', 'Reward'], weekly.map(m => [m.text, rw(m.reward)]), 'ms-weekly'),
    h('h3', { class: 'mc-h3' }, 'Titles'),
    h('p', null, D.titles.length + ' titles, each from an achievement: ' + D.titles.map(t => t.title).join(', ') + '. Choose one on Missions → Titles or in your profile; it shows under your Pokémon on the main menu, on your trainer card and on your public profile. On two devices, the title chosen last wins.'),
    h('h3', { class: 'mc-h3' }, 'After a run: damage and defeats'),
    h('p', null, 'The run-over screen lists the damage (the HP enemies really lost) and the defeats of each of your moves, most damage first, then ' + D.breakdown.map(b => b.name).join(', ') + ', each with its share of the total (they add up to 100 %).'),
    h('h3', { class: 'mc-h3' }, 'Lexicon'),
    h('p', null, 'The in-game encyclopedia, with the tabs ' + D.lexicon.tabs.map(t => t.name).join(', ') + '. Items show whether you have found them, moves what they evolve into and whether you ever evolved them, Z-moves and Dynamax whether they are unlocked, Pokémon whether you have them, and the modes and the Floor Tower your records (best floor, relics, the boss log). Every entry opens with its full text.'),
    msTable(['Status', 'What it does'], D.lexicon.status.map(st => [h('b', null, st.name), st.desc]), 'ms-status'),
    h('h3', { class: 'mc-h3' }, 'Trainer card'),
    h('p', null, 'Profile → "View my trainer card": your name, your title, your Pokémon and three favourites, and ' + D.card.join(', ') + ', with your records in every mode. View only: nothing to share or export, and nothing from your account beyond the name other players already see.'));
}

let msPokeQ = '';
async function micasurvivorPokemonView() {
  const D = await msLoadOr('Pokémon', 'pokemon'); if (!D) return;
  const STARS = n => '★'.repeat(n);
  const starterGrid = h('div', { class: 'ms-starters' }, D.starters.map(s => h('div', { class: 'ms-starter' },
    h('b', null, s.name), h('div', null, s.types.map(msType)), h('small', { class: 'muted' }, '#' + s.dex + ' · starts with ' + s.start))));
  // MicaSurvivor M5 batch 2: every Pokémon has one passive ability (micasurvivor/js/systems/abilities.js)
  const AB = Object.fromEntries((D.abilities || []).map(a => [a.id, a]));
  const abCell = id => { const a = AB[id]; return a ? h('span', { class: 'ms-ab', title: a.desc }, a.name) : ''; };
  const body = h('tbody');
  const count = h('span', { class: 'muted' });
  const draw = () => {
    const q = msPokeQ.trim().toLowerCase();
    const list = D.pokemon.filter(([dex, name, types, , , , ab]) => !q || name.toLowerCase().includes(q) || String(dex) === q || types.includes(q) || (AB[ab] && AB[ab].name.toLowerCase() === q));
    count.textContent = list.length + ' shown';
    body.replaceChildren(...list.map(([dex, name, types, rarity, gen, leg, ab]) => h('tr', null,
      h('td', null, '#' + dex), h('td', null, name), h('td', null, types.map(msType)), h('td', null, abCell(ab)), h('td', { class: 'ms-stars' }, STARS(rarity)), h('td', null, 'Gen ' + gen), h('td', null, leg ? 'Legendary (rifts only)' : ''))));
  };
  const abTable = msTable(['Ability', 'What it does', 'Pokémon'], (D.abilities || []).map(a => [
    h('b', null, a.name), a.desc, h('a', { href: '#/micasurvivor/pokemon', onclick: e => { e.preventDefault(); msPokeQ = a.name.toLowerCase(); input.value = msPokeQ; draw(); body.closest('section')?.scrollIntoView({ behavior: 'smooth' }); } }, String(a.pokemon)),
  ]), 'ms-abilities');
  const input = h('input', { type: 'search', placeholder: 'Filter by name, number or type', value: msPokeQ, class: 'ms-filter' });
  input.addEventListener('input', () => { msPokeQ = input.value; draw(); });
  draw();
  content.replaceChildren(msBack(),
    mcHead('Pokémon', D.counts.pokemon, 'Pokémon', 'Every Pokémon in the game can be your partner once you own it (the starters, the gacha, shinies caught in runs). Legendaries and mythicals appear only in rifts. Rarity (★1–5) sets the gacha odds.'),
    mcSection('Starters', D.counts.starters + ' partners the personality test can choose (every region’s starters, and two friends).', starterGrid),
    mcSection('Abilities', D.counts.abilities + ' passive abilities, from the Android port by JayElDragon: every Pokémon has one (shown in the run’s HUD, the Pokédex and the pause screen). The numbers are the port’s. Click a count to list those Pokémon.', abTable),
    mcSection('Every Pokémon', null, h('p', null, input, ' ', count),
      h('table', { class: 'ms-table ms-pokemon' }, h('thead', null, h('tr', null, ...['Dex', 'Name', 'Types', 'Ability', 'Rarity', 'Banner', ''].map(c => h('th', null, c)))), body)));
}

async function micasurvivorMovesView() {
  const D = await msLoadOr('Moves', 'moves'); if (!D) return;
  const KIND = { projectile: 'Projectile', melee: 'Melee arc', beam: 'Beam', orbit: 'Orbit', nova: 'Nova', aura: 'Aura', buff: 'Buff', boomerang: 'Boomerang', chain: 'Chain', mine: 'Mines', meteor: 'Meteor', turret: 'Turret', dash: 'Dash', trail: 'Trail', cone: 'Cone' };
  content.replaceChildren(msBack(),
    mcHead('Moves', D.counts.moves, 'moves', 'Your active move attacks on its own. A Pokémon learns Normal moves plus the moves of its own types. Each move levels up to its maximum through the level-up cards; at the top level it EVOLVES once you have also taken the stat card it needs.'),
    msTable(['Move', 'Type', 'Kind', 'Cooldown', 'Damage', 'Evolves into', 'What it does'], D.moves.map(m => [
      h('b', null, m.name), msType(m.type), KIND[m.kind] || m.kind, m.cd != null ? m.cd + ' s' : '—', m.dmg != null ? String(m.dmg) : '—',
      m.evo ? [h('b', null, m.evo.name), h('small', { class: 'muted' }, ' (needs ' + m.evo.needs + ')')] : '—', m.desc,
    ]), 'ms-moves'),
    // MicaSurvivor M5 batch 4: the Z-moves (micasurvivor/js/systems/zmoves.js)
    ...((D.zmoves || []).length ? [mcSection('Z-Moves', 'One finishing move per type, each with its own choreography. From level ' + D.zrules.minLevel
      + '; a ' + D.zrules.cooldown / 60 + '-minute cooldown that starts when the move ends; a 2.2 s cinematic and invulnerable throughout; damage (100 + 24 × level) × attack; at most '
      + Math.round(D.zrules.bossCap * 100) + ' % of a boss\'s max HP; not in rift arenas or the Judgment. The active Pokémon\'s type picks it (with two unlocked types, choose in the Pokédex). '
      + 'Unlock a type\'s Z by defeating ' + D.zrules.need + ' Pokémon of that type, by its Z-crystal mission (+' + D.zrules.missionCoins + ' coins) or with a crystal from a ×10 gacha pull ('
      + Math.round(D.zrules.crystal * 100) + ' %, only types still locked). Use it with the Z key, the HUD button or the controller (L3).',
      msTable(['Z-Move', 'Type', 'What it does', 'Z-crystal mission'], D.zmoves.map(z => [h('b', null, z.name), msType(z.type), z.desc, z.mission]), 'ms-zmoves'))] : []),
    // MicaSurvivor M5 batch 5: Dynamax and raid dens (micasurvivor/js/systems/dynamax.js)
    ...(D.dynrules ? [(() => {
      const R = D.dynrules, pct = v => Math.round(v * 100) + ' %';
      const CC = { para: 'paralyses', freeze: 'freezes', sleep: 'puts to sleep', conf: 'confuses' };
      return mcSection('Dynamax & raid dens', 'From the Android port by JayElDragon. Your Pokémon turns giant (' + R.grow + '×) for ' + R.dur + ' s: +' + pct(R.statK - 1)
        + ' to every stat (damage and speed ×' + R.statK + ', cooldowns ÷' + R.statK + ', ' + (R.taken * 100).toFixed(2) + ' % less damage taken) and +' + pct(R.hpBonus)
        + ' max HP (removed at the end, HP in proportion). Every ' + R.pulse + ' s it sends a Max wave of its type — radius ' + R.pulseR + ', every third ' + R.bigR
        + ' at ×' + R.bigK + ' — for (30 + 8 × level) × attack. From level ' + R.minLevel + '; a ' + R.cooldown / 60 + '-minute cooldown after it ends; not in the Tower or the Judgment (fine inside arenas). '
        + 'Unlocked by clearing a raid den: from ' + R.denFrom + ' s into a run, each 30 s rift check has a ' + pct(R.denRate) + ' chance to open a den instead (not in Rift Time Attack). '
        + 'A den stays open ' + R.denTtl + ' s; inside waits a normal Pokémon of the current tier, ' + R.denScale + '× and red, with 2400 + 8 × t HP and its own Max Move. Reward: '
        + R.reward.orbs + ' XP orbs, ' + R.reward.items + ' items, ' + R.reward.tickets + ' tickets, ' + R.reward.coins + ' coins and a heal — and every den cleared recharges Dynamax at once. '
        + 'Use it with the C key, the HUD MAX button or the controller (View / Share / −).',
        msTable(['Type', 'Max wave adds'], R.status.map(st => [msType(st.type), [st.cc ? CC[st.cc] || st.cc : '', st.poison ? 'poison' : '', st.slow ? 'slows ' + pct(st.slow) : ''].filter(Boolean).join(', ')]), 'ms-dynamax'));
    })()] : []));
}

async function micasurvivorItemsView() {
  const D = await msLoadOr('Items & Upgrades', 'items'); if (!D) return;
  content.replaceChildren(msBack(),
    mcHead('Items & Upgrades', D.counts.items + D.counts.upgrades, 'entries', null),
    mcSection('Held items', 'Found in chests (often the locked ones) and dropped by bosses, all equally likely. You hold ONE at a time for the run (TWO with the Backpack upgrade); finding another lets you choose which to keep. Species-locked items only drop for the Pokémon that can use them.',
      msTable(['Item', 'Effect', 'Who'], D.items.map(i => [h('b', null, i.name), i.desc, i.only ? i.only.join(', ') : i.instant ? 'Anyone (used at once, takes no slot)' : 'Anyone']))),
    mcSection('Upgrades', 'Permanent, bought with Pokémonedas between runs — for each Pokémon separately.',
      msTable(['Upgrade', 'Per level', 'Max level', 'Cost per level'], D.upgrades.map(u => [h('b', null, u.name), u.unit, String(u.max), (u.costs || []).join(' · ')]))));
}

function micasurvivorRoute(sub) {
  if (sub === 'pokemon') return micasurvivorPokemonView();
  if (sub === 'moves') return micasurvivorMovesView();
  if (sub === 'items') return micasurvivorItemsView();
  if (!sub) return micasurvivorView();
  notFound();
}

function notFound() { content.replaceChildren(h('h1', null, 'Not found')); }
function home() {
  const counts = h('p', { class: 'muted' }, Object.keys(DB.pokemon).length + ' Pokémon · ' +
    Object.keys(DB.moves).length + ' moves · ' + Object.keys(DB.abilities).length + ' abilities');
  content.replaceChildren(h('h1', null, 'Magepunk Design Wiki'),
    h('p', null, 'The reference for everything in Magepunk — the ', h('a', { href: '#/pokemon' }, 'Pokémon side'),
      ' (Pokédex, moves, abilities, per-region encounters & trainers) and the ', h('a', { href: '#/cards' }, 'Battlecards side'),
      ' (the full card gallery, land pools, and every run mode from the Dungeon to the Lorequests).'),
    counts,
    h('p', null, h('a', { href: '/' }, '← Back to michaelgibalerio.com')));
  // the card count loads lazily — cards.json is heavy and the home page shouldn't wait on it
  loadCards().then(cards => { counts.append(' · ' + cards.filter(c => c.collectible !== false).length + ' collectible cards'); }).catch(() => {});
}

// ---- Land Pools: a tier-grouped index of every land + its themed card set ----
const LAND_TIERS = [
  ['basic', 'Basic Land Sets', 'Colorless & mono basics — each taps to conjure a random card from a 70-card set.'],
  ['mono', 'Mono-Color Temples', 'One colour each — tap to Discover 1 of 3 from a 15-card pool.'],
  ['two', 'Two-Color Lands', 'Guildgates, Theros god-temples, Tarkir Dragonspires, Strixhaven Campuses & Kaldheim Citadels.'],
  ['three', 'Three-Color Triomes', 'Alara shards & Tarkir wedges — a 15-card three-colour pool each.'],
  ['colorless', 'Colorless Advanced Lands', '']
];
function landTile(l) {
  return h('a', { class: 'lp-tile tier-' + l.tier, href: '#/land-pools/' + l.id },
    h('span', { class: 'lp-name' }, l.name),
    h('span', { class: 'lp-meta' }, colorPips(l.colors), h('span', { class: 'lp-count' }, l.count + ' cards')));
}
async function landPoolsView() {
  content.replaceChildren(h('h1', null, 'Land Pools'), h('p', { class: 'muted' }, 'Loading lands…'));
  let cards;
  try { [cards] = await Promise.all([loadCards(), loadCardart().then(() => null)]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Land Pools'), h('p', { class: 'muted' }, 'Could not load the card data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'land-pools') return;
  const lands = cards.filter(c => c.type === 'land').map(c => landInfo(c, cards)).filter(l => l.landSet && l.count);
  const totalCards = lands.reduce((n, l) => n + l.count, 0);
  const sections = [];
  for (const [key, title, blurb] of LAND_TIERS) {
    const group = lands.filter(l => l.tier === key).sort((a, b) => a.name.localeCompare(b.name));
    if (!group.length) continue;
    sections.push(h('section', { class: 'lp-tier' },
      h('div', { class: 'lp-tier-head' },
        h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + group.length + ')')),
        blurb ? h('p', { class: 'muted' }, blurb) : null),
      h('div', { class: 'lp-grid' }, ...group.map(landTile))));
  }
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Land Pools'),
        h('p', { class: 'muted' }, 'Every land taps into its own themed card set. Tap a land to browse its pool.')),
      h('div', { class: 'result-count' }, lands.length, h('span', null, ' lands · ' + totalCards.toLocaleString() + ' cards'))),
    ...sections);
}
async function landPoolDetail(id) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading pool…'));
  let cards;
  try { [cards] = await Promise.all([loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Land Pool'), h('p', { class: 'muted' }, 'Could not load the card data.')); }
  const land = cards.find(c => c.id === id && c.type === 'land');
  if (!land) return content.replaceChildren(h('h1', null, 'Land not found'),
    h('p', null, h('a', { href: '#/land-pools' }, '← Back to Land Pools')));
  const info = landInfo(land, cards);
  const byCost = (a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name));
  const pool = cards.filter(c => c.landSet === info.landSet && !c.token).sort(byCost);
  // A pool can carry correspondence-only alternates (corrOnly): cards that exist
  // ONLY in the play-by-mail format, where the pool conjures/discovers them
  // instead of its banned counter-cards. Show them in their own section so the
  // regular pool size reads true.
  const regular = pool.filter(c => !c.corrOnly);
  const corr = pool.filter(c => c.corrOnly);
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'land-pools') return;
  await CardArt.preloadArt([CardArt.artIdOf(land), ...pool.map(CardArt.artIdOf)]);
  const face = CardArt.drawCardFace(land); face.className = 'wiki-face-big';
  const tapLines = (land.description || '').split('\n').filter(Boolean);
  const countText = corr.length
    ? regular.length + ' regular + ' + corr.length + ' correspondence-only'
    : pool.length + ' cards in pool';
  const gridSection = (title, note, group) => h('section', { class: 'lp-pool-section' },
    h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + group.length + ')')),
    note ? h('p', { class: 'muted' }, note) : null,
    h('div', { class: 'card-grid size-medium' }, ...group.map(cardTile)));
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/land-pools' }, '← All Land Pools')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, land.name),
        h('div', { class: 'lp-detail-meta' }, colorPips(info.colors), h('span', { class: 'lp-count' }, countText)),
        h('ul', { class: 'lp-taps' }, ...tapLines.map(t => h('li', null, t))))),
    !pool.length ? h('p', { class: 'muted' }, 'This land has no pool cards yet.')
      : corr.length
        // split: regular pool first, then the correspondence-only alternates
        ? h('div', null,
            gridSection('Pool cards', null, regular),
            gridSection('Correspondence-only', 'These exist ONLY in the play-by-mail format, where this pool conjures/discovers them instead of its banned counter-cards.', corr))
        // no alternates: a single flat grid, as before
        : h('div', { class: 'card-grid size-medium' }, ...regular.map(cardTile)));
}

// ---- Correspondence (play-by-mail) format: countering is banned; the Island
// pool swaps its 13 counterspells for 13 correspondence-only alternates.
// Banned list derives live from battlecards/format.js (same predicate the
// server list is generated from), alternates from the corrOnly tag.
async function correspondenceView() {
  content.replaceChildren(h('h1', null, 'Correspondence Format'), h('p', { class: 'muted' }, 'Loading cards…'));
  let cards, fmt;
  try {
    [cards, fmt] = await Promise.all([loadCards(), import('../battlecards/format.js'), loadCardart().then(() => null)]);
  } catch (e) { return content.replaceChildren(h('h1', null, 'Correspondence Format'), h('p', { class: 'muted' }, 'Could not load the card data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'correspondence') return;
  const banned = cards.filter(c => !c.token && fmt.isCounterCard(c))
    .sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  const alts = cards.filter(c => c.corrOnly)
    .sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  await CardArt.preloadArt([...banned, ...alts].map(CardArt.artIdOf));
  // alternates grouped by the land pool they patch back to full size
  const byPool = new Map();
  for (const c of alts) {
    const key = c.landSet || 'Other';
    if (!byPool.has(key)) byPool.set(key, []);
    byPool.get(key).push(c);
  }
  const poolSections = [...byPool.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([pool, group]) => h('div', { class: 'lp-tier' },
      h('h3', null, pool + ' pool ', h('span', { class: 'num' }, '(' + group.length + ')')),
      h('div', { class: 'card-grid size-medium' }, ...group.map(cardTile))));
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Correspondence Format'),
        h('p', { class: 'muted' },
          'Play-by-mail is its own format: there are no mid-turn response windows, so every card that counters spells is banned — ',
          'decks containing them cannot enter a correspondence match, and in-game generation never produces them. ',
          'Secrets, traps and other pre-committed reactions still work. ',
          'Every land pool that lost cards to the ban gets correspondence-only alternates (below), so each pool keeps its full size in this format.')),
      h('div', { class: 'result-count' }, banned.length + alts.length, h('span', null, ' cards'))),
    h('section', null,
      h('h2', null, 'Banned cards ', h('span', { class: 'num' }, '(' + banned.length + ')')),
      h('p', { class: 'muted' }, 'Everything that counters spells, in any mode or trigger. (+1/+1 “counter” cards are unaffected.)'),
      h('div', { class: 'card-grid size-medium' }, ...banned.map(cardTile))),
    h('section', null,
      h('h2', null, 'Correspondence-only alternates ', h('span', { class: 'num' }, '(' + alts.length + ')')),
      h('p', { class: 'muted' }, 'These cards exist ONLY in correspondence matches, where their pool conjures/discovers them instead of its banned cards. The Island basics swap 13 counterspells; each advanced pool that lost a counter-secret gets an in-identity stand-in — same cost slot, same payoff, on a pre-committed trigger.'),
      ...poolSections));
}

// ---- Lorequest character decks: 37 base decks (16 planeswalkers + 21 bosses),
// each 15 uncollectible cards run as 2 copies (a 30-card deck). Data mirrors the
// loreDeck tag in cards.json + the rosters/class map in battlecards/lorequest.js.
const lqSlug = ch => ch.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function lqDeckCards(cards, ch) {
  return cards.filter(c => c.loreDeck === ch && !c.token)
    .sort((a, b) => (b.id.endsWith('_sig') - a.id.endsWith('_sig'))
      || Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
}
const lqSig = deck => deck.find(c => c.id.endsWith('_sig')) || deck.find(c => c.rarity === 'legendary') || deck[0];
function lqColors(deck) {
  const s = new Set();
  for (const c of deck) for (const col of colorsOf(c)) s.add(col);
  return COLOR_PIP_ORDER.filter(x => s.has(x));
}
function lqTile(ch, deck, clsName) {
  const canvas = CardArt.drawCardFace(lqSig(deck));
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: ch, loading: 'lazy' });
  return h('a', { class: 'wiki-card lq-tile', href: '#/lore-decks/' + lqSlug(ch), title: ch },
    img,
    h('div', { class: 'lq-name' }, ch),
    h('div', { class: 'lq-sub' }, colorPips(lqColors(deck)), h('span', { class: 'lq-cls' }, clsName)));
}
// a Small/Medium/Large control that resizes a card-grid in place, remembered across visits
const LQ_SIZE_KEY = 'magepunk_wiki_cardsize';
function cardSizeControl(grid) {
  const sizes = [['small', 'S'], ['medium', 'M'], ['large', 'L']];
  let cur = localStorage.getItem(LQ_SIZE_KEY) || 'medium';
  if (!sizes.some(s => s[0] === cur)) cur = 'medium';
  const apply = s => { grid.className = 'card-grid size-' + s; };
  apply(cur);
  const btns = {};
  const bar = h('div', { class: 'lq-sizebar' }, ...sizes.map(([s, lbl]) => {
    const b = h('button', {
      class: 'lq-sizebtn' + (s === cur ? ' active' : ''), title: s + ' cards',
      onclick: () => { cur = s; try { localStorage.setItem(LQ_SIZE_KEY, s); } catch (e) {} apply(s); for (const k in btns) btns[k].classList.toggle('active', k === s); }
    }, lbl);
    btns[s] = b; return b;
  }));
  return h('div', { class: 'lq-sizectl' }, h('span', { class: 'muted' }, 'Card size'), bar);
}
async function lorequestView() {
  content.replaceChildren(h('h1', null, 'Lorequest Decks'), h('p', { class: 'muted' }, 'Loading decks…'));
  let LQ, classes, cards;
  try { [LQ, classes, cards] = await Promise.all([loadLorequest(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Lorequest Decks'), h('p', { class: 'muted' }, 'Could not load the Lorequest data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'lore-decks') return;
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase((id || '').replace(/_/g, ' '));
  const decks = {}; for (const ch of [...LQ.PLANESWALKERS, ...LQ.BOSSES]) decks[ch] = lqDeckCards(cards, ch);
  await CardArt.preloadArt(Object.values(decks).map(d => lqSig(d)?.id).filter(Boolean));
  const group = (title, blurb, names) => h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + names.length + ')')),
      h('p', { class: 'muted' }, blurb)),
    h('div', { class: 'card-grid size-small' },
      ...names.map(ch => lqTile(ch, decks[ch], clsName(LQ.classOf(ch))))));
  const totalCards = Object.values(decks).reduce((n, d) => n + d.length, 0);
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Lorequest Decks'),
        h('p', { class: 'muted' }, 'The single-player ', h('a', { href: '#/duels' }, 'Duels'),
          ' variant. Pick 1 of 3 planeswalker decks, then climb to 12 wins (or 3 losses) — the other planeswalkers are your first eight fights, then the Eldrazi & legendary bosses. Each is a 15-card base deck run as 2 copies (a 30-card deck). Tap one to see its cards.')),
      h('div', { class: 'result-count' }, (LQ.PLANESWALKERS.length + LQ.BOSSES.length), h('span', null, ' decks · ' + totalCards + ' cards'))),
    group('Planeswalkers', 'The 16 starter decks — one of three is offered at the start of a run; the rest are your first eight opponents.', LQ.PLANESWALKERS),
    group('Eldrazi & Legendary Bosses', 'The 21 end-game commanders — your opponents from battle 9 onward, once the planeswalker gauntlet is cleared.', LQ.BOSSES));
}
async function lorequestDeckDetail(slug) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading deck…'));
  let LQ, classes, cards;
  try { [LQ, classes, cards] = await Promise.all([loadLorequest(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Lorequest Deck'), h('p', { class: 'muted' }, 'Could not load the Lorequest data.')); }
  const all = [...LQ.PLANESWALKERS, ...LQ.BOSSES];
  const ch = all.find(x => lqSlug(x) === slug);
  if (!ch) return content.replaceChildren(h('h1', null, 'Deck not found'),
    h('p', null, h('a', { href: '#/lore-decks' }, '← Back to Lorequest Decks')));
  const deck = lqDeckCards(cards, ch);
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'lore-decks') return;
  const byId = {}; for (const c of cards) byId[c.id] = c;
  await CardArt.preloadArt(deck.map(CardArt.artIdOf));
  const face = CardArt.drawCardFace(lqSig(deck)); face.className = 'wiki-face-big';
  const grid = await deckGrid(deck.map(c => c.id), byId);
  const clsName = (classes.find(c => c.id === LQ.classOf(ch))?.name) || titleCase(LQ.classOf(ch).replace(/_/g, ' '));
  const isBoss = LQ.BOSSES.includes(ch);
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/lore-decks' }, '← All Lorequest Decks')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, ch),
        h('div', { class: 'lp-detail-meta' }, colorPips(lqColors(deck)),
          h('span', { class: 'lq-cls' }, clsName),
          h('span', { class: 'lp-count' }, deck.length + ' cards · 2 copies each = 30-card deck')),
        h('p', { class: 'muted' }, isBoss
          ? `An Eldrazi / legendary boss commander — faced from battle 9 onward once the planeswalker gauntlet is cleared. Its hero power and loot buckets come from the ${clsName} class.`
          : `A planeswalker starter deck — one of three offered at the start of a run, and one of your first eight opponents. Its hero power and loot buckets come from the ${clsName} class.`))),
    h('h2', null, 'Base Deck ', h('span', { class: 'num' }, '(15 cards)')),
    cardSizeControl(grid), grid);
}

// ---- Lorequest: Middle-earth decks — 11 heroes (10-card singletons) + 27 rung-split
// enemies (15 cards ×2 = 30). Data mirrors the meDeck/meSide tags in cards.json + the
// rosters/rungs/class map/hero powers in battlecards/middleearth.js.
function meDeckCards(cards, ch) {
  return cards.filter(c => c.meDeck === ch && !c.token)
    .sort((a, b) => (b.id.endsWith('_sig') - a.id.endsWith('_sig'))
      || Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
}
function meTile(ch, deck, clsName, pw, colors) {
  const canvas = CardArt.drawCardFace(lqSig(deck));
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: ch, loading: 'lazy' });
  return h('a', { class: 'wiki-card lq-tile', href: '#/middle-earth/' + lqSlug(ch), title: pw ? `${pw.name}: ${pw.text}` : ch },
    img,
    h('div', { class: 'lq-name' }, ch),
    h('div', { class: 'lq-sub' }, colorPips(colors), h('span', { class: 'lq-cls' }, clsName)));
}
async function middleEarthView() {
  content.replaceChildren(h('h1', null, 'Lorequest: Middle-earth'), h('p', { class: 'muted' }, 'Loading decks…'));
  let ME, classes, cards;
  try { [ME, classes, cards] = await Promise.all([loadMiddleearth(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Lorequest: Middle-earth'), h('p', { class: 'muted' }, 'Could not load the Middle-earth data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'middle-earth') return;
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase((id || '').replace(/_/g, ' '));
  const heroes = [...ME.HEROES, ...ME.SECRET_HEROES];
  const allChars = [...heroes, ...ME.ENEMIES];
  const decks = {}; for (const ch of allChars) decks[ch] = meDeckCards(cards, ch);
  await CardArt.preloadArt(allChars.map(ch => lqSig(decks[ch])?.id).filter(Boolean));
  const group = (title, blurb, names) => h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + names.length + ')')),
      h('p', { class: 'muted' }, blurb)),
    h('div', { class: 'card-grid size-small' },
      ...names.map(ch => meTile(ch, decks[ch], clsName(ME.classOf(ch)), ME.powerOf(ch), ME.colorsOf(ch)))));
  const totalCards = Object.values(decks).reduce((n, d) => n + d.length, 0);
  // Treasures — neutral rewards drafted on odd wins (The One Ring + the Hobbit-set treasures)
  const treasures = cards.filter(c => c.meTreasure).sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  await CardArt.preloadArt(treasures.map(CardArt.artIdOf));
  const treasureSection = h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, 'Treasures', ' ', h('span', { class: 'num' }, '(' + treasures.length + ')')),
      h('p', { class: 'muted' }, 'Powerful neutral treasures drafted on odd wins (with The One Ring). Rendered from The Hobbit set art.')),
    h('div', { class: 'card-grid size-small' },
      ...treasures.map(c => { const canvas = CardArt.drawCardFace(c); return h('div', { class: 'wiki-card' }, h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: c.name, loading: 'lazy', title: c.description || c.name }), h('div', { class: 'lq-name' }, c.name)); })));
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Lorequest: Middle-earth'),
        h('p', { class: 'muted' }, 'A LOTR/Hobbit dungeon run. Pick a hero of the Free Peoples (a 10-card starter deck) and climb the rungs of Sauron’s forces to 12 wins or 3 losses. Unlike ', h('a', { href: '#/duels' }, 'Duels'), ', enemies are STATIC — each a 15-card deck run as 2 copies (30), with its own signature hero power; you grow your deck via a spoils draft + alternating treasure/bucket each win. Tap one to see its cards.')),
      h('div', { class: 'result-count' }, allChars.length, h('span', null, ' decks · ' + totalCards + ' cards · ' + treasures.length + ' treasures'))),
    group('Heroes — Free Peoples', '11 heroes (Tom Bombadil is a secret, unlocked by clearing a full run). Each is a 10-card singleton starter deck you grow as you win.', heroes),
    group('Rung A — Mooks', 'Your first fights (wins 0–2). Bill Ferny & Lotho appear only as your very first encounter.', ME.ENEMY_RUNGS.A),
    group('Rung B — Lieutenants', 'Captains and monsters (wins 3–6).', ME.ENEMY_RUNGS.B),
    group('Rung C — Commanders', 'The named boss commanders (wins 7–10).', ME.ENEMY_RUNGS.C),
    group('Rung D — The Dark Lord', 'The 12th-win final boss — the two Saurons rotate for replay variety.', ME.ENEMY_RUNGS.D),
    treasureSection);
}
async function middleEarthDeckDetail(slug) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading deck…'));
  let ME, classes, cards;
  try { [ME, classes, cards] = await Promise.all([loadMiddleearth(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Middle-earth Deck'), h('p', { class: 'muted' }, 'Could not load the Middle-earth data.')); }
  const allChars = [...ME.HEROES, ...ME.SECRET_HEROES, ...ME.ENEMIES];
  const ch = allChars.find(x => lqSlug(x) === slug);
  if (!ch) return content.replaceChildren(h('h1', null, 'Deck not found'),
    h('p', null, h('a', { href: '#/middle-earth' }, '← Back to Lorequest: Middle-earth')));
  const deck = meDeckCards(cards, ch);
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'middle-earth') return;
  const byId = {}; for (const c of cards) byId[c.id] = c;
  await CardArt.preloadArt(deck.map(CardArt.artIdOf));
  const face = CardArt.drawCardFace(lqSig(deck)); face.className = 'wiki-face-big';
  const grid = await deckGrid(deck.map(c => c.id), byId);
  const clsName = (classes.find(c => c.id === ME.classOf(ch))?.name) || titleCase(ME.classOf(ch).replace(/_/g, ' '));
  const isEnemy = ME.isEnemy(ch);
  const secret = ME.SECRET_HEROES.includes(ch);
  const pw = ME.powerOf(ch);
  const rung = !isEnemy ? null
    : ME.ENEMY_RUNGS.A.includes(ch) ? 'A — Mook' : ME.ENEMY_RUNGS.B.includes(ch) ? 'B — Lieutenant'
      : ME.ENEMY_RUNGS.C.includes(ch) ? 'C — Commander' : 'D — The Dark Lord';
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/middle-earth' }, '← All Middle-earth decks')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, ch),
        h('div', { class: 'lp-detail-meta' },
          colorPips(ME.colorsOf(ch)),
          h('span', { class: 'lq-cls' }, clsName),
          isEnemy ? h('span', { class: 'lq-cls' }, 'Rung ' + rung) : null,
          h('span', { class: 'lp-count' }, isEnemy ? (deck.length + ' cards · 2 copies each = 30-card deck') : (deck.length + '-card singleton starter deck'))),
        pw ? h('p', { class: 'muted' }, h('strong', null, 'Hero Power — ' + pw.name + ': '), pw.text) : null,
        h('p', { class: 'muted' }, isEnemy
          ? `A static enemy faced as you climb — no win-parity loot; its signature hero power gives it teeth.`
          : (secret ? `A secret hero, unlocked by clearing a full run (12 wins). Its loot buckets come from the ${clsName} class.`
            : `A Free Peoples hero — one of the 10 offered at the start of a run. You grow this 10-card deck via a spoils draft + an alternating treasure/bucket each win. Its loot buckets come from the ${clsName} class.`)))),
    h('h2', null, 'Deck ', h('span', { class: 'num' }, '(' + deck.length + ' cards' + (isEnemy ? ' · ×2 = 30' : '') + ')')),
    cardSizeControl(grid), grid);
}

// ── Lorequest: Sword Coast (D&D) — mirrors the Middle-earth surfaces, tagged scDeck/scSide ──
function scDeckCards(cards, ch) {
  return cards.filter(c => c.scDeck === ch && !c.token)
    .sort((a, b) => ((b.rarity === 'legendary') - (a.rarity === 'legendary'))
      || Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
}
function scTile(ch, deck, clsName, pw, colors) {
  const canvas = CardArt.drawCardFace(lqSig(deck));
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: ch, loading: 'lazy' });
  return h('a', { class: 'wiki-card lq-tile', href: '#/sword-coast/' + lqSlug(ch), title: pw ? `${pw.name}: ${pw.text}` : ch },
    img,
    h('div', { class: 'lq-name' }, ch),
    h('div', { class: 'lq-sub' }, colorPips(colors), h('span', { class: 'lq-cls' }, clsName)));
}
async function swordCoastView() {
  content.replaceChildren(h('h1', null, 'Lorequest: Sword Coast'), h('p', { class: 'muted' }, 'Loading decks…'));
  let SC, classes, cards;
  try { [SC, classes, cards] = await Promise.all([loadSwordcoast(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Lorequest: Sword Coast'), h('p', { class: 'muted' }, 'Could not load the Sword Coast data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'sword-coast') return;
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase((id || '').replace(/_/g, ' '));
  const heroes = [...SC.HEROES, ...SC.SECRET_HEROES];
  const allChars = [...heroes, ...SC.ENEMIES];
  const decks = {}; for (const ch of allChars) decks[ch] = scDeckCards(cards, ch);
  await CardArt.preloadArt(allChars.map(ch => lqSig(decks[ch])?.id).filter(Boolean));
  const group = (title, blurb, names) => h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + names.length + ')')),
      h('p', { class: 'muted' }, blurb)),
    h('div', { class: 'card-grid size-small' },
      ...names.map(ch => scTile(ch, decks[ch], clsName(SC.classOf(ch)), SC.powerOf(ch), SC.colorsOf(ch)))));
  const totalCards = Object.values(decks).reduce((n, d) => n + d.length, 0);
  // SC-specific treasures — neutral rewards drafted on odd wins
  const treasures = cards.filter(c => c.scTreasure).sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  await CardArt.preloadArt(treasures.map(CardArt.artIdOf));
  const treasureSection = h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, 'Treasures', ' ', h('span', { class: 'num' }, '(' + treasures.length + ')')),
      h('p', { class: 'muted' }, 'Powerful neutral treasures drafted on odd wins (with the shared treasure pool). Legendary D&D magic items & relics.')),
    h('div', { class: 'card-grid size-small' },
      ...treasures.map(c => { const canvas = CardArt.drawCardFace(c); return h('div', { class: 'wiki-card' }, h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: c.name, loading: 'lazy', title: c.description || c.name }), h('div', { class: 'lq-name' }, c.name)); })));
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Lorequest: Sword Coast'),
        h('p', { class: 'muted' }, 'A Dungeons & Dragons dungeon run built from the AFR/CLB card art. Pick a Companion of the Realms (a 10-card starter deck) and Advance through the Sword Coast’s villains to 12 wins or 3 losses. Its signature mechanic is ', h('strong', null, 'Advance'), ' (venture into the dungeon) with a sprinkle of d20 rolls. Like ', h('a', { href: '#/middle-earth' }, 'Middle-earth'), ', enemies are STATIC — each a 15-card deck run as 2 copies (30) with its own signature hero power; you grow your deck via a spoils draft + alternating treasure/bucket each win. Tap one to see its cards.')),
      h('div', { class: 'result-count' }, allChars.length, h('span', null, ' decks · ' + totalCards + ' cards · ' + treasures.length + ' treasures'))),
    group('Heroes — Companions of the Realms', '11 heroes (Gale, Waterdeep Prodigy is a secret, unlocked by clearing a full run). Each is a 10-card singleton starter deck you grow as you Advance.', heroes),
    group('Rung A — Henchmen', 'Your first fights (wins 0–2). Gut & Baeloth appear only as your very first encounter.', SC.ENEMY_RUNGS.A),
    group('Rung B — Lieutenants', 'Beholders, giants, and warlords (wins 3–6).', SC.ENEMY_RUNGS.B),
    group('Rung C — Commanders', 'The Dead Three and archfiends (wins 7–10).', SC.ENEMY_RUNGS.C),
    group('Rung D — Archfiend', 'The 12th-win final boss — Tiamat and Asmodeus rotate for replay variety.', SC.ENEMY_RUNGS.D),
    treasureSection);
}
async function swordCoastDeckDetail(slug) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading deck…'));
  let SC, classes, cards;
  try { [SC, classes, cards] = await Promise.all([loadSwordcoast(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Sword Coast Deck'), h('p', { class: 'muted' }, 'Could not load the Sword Coast data.')); }
  const allChars = [...SC.HEROES, ...SC.SECRET_HEROES, ...SC.ENEMIES];
  const ch = allChars.find(x => lqSlug(x) === slug);
  if (!ch) return content.replaceChildren(h('h1', null, 'Deck not found'),
    h('p', null, h('a', { href: '#/sword-coast' }, '← Back to Lorequest: Sword Coast')));
  const deck = scDeckCards(cards, ch);
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'sword-coast') return;
  const byId = {}; for (const c of cards) byId[c.id] = c;
  await CardArt.preloadArt(deck.map(CardArt.artIdOf));
  const face = CardArt.drawCardFace(lqSig(deck)); face.className = 'wiki-face-big';
  const grid = await deckGrid(deck.map(c => c.id), byId);
  const clsName = (classes.find(c => c.id === SC.classOf(ch))?.name) || titleCase(SC.classOf(ch).replace(/_/g, ' '));
  const isEnemy = SC.isEnemy(ch);
  const secret = SC.SECRET_HEROES.includes(ch);
  const pw = SC.powerOf(ch);
  const rung = !isEnemy ? null
    : SC.ENEMY_RUNGS.A.includes(ch) ? 'A — Henchman' : SC.ENEMY_RUNGS.B.includes(ch) ? 'B — Lieutenant'
      : SC.ENEMY_RUNGS.C.includes(ch) ? 'C — Commander' : 'D — Archfiend';
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/sword-coast' }, '← All Sword Coast decks')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, ch),
        h('div', { class: 'lp-detail-meta' },
          colorPips(SC.colorsOf(ch)),
          h('span', { class: 'lq-cls' }, clsName),
          isEnemy ? h('span', { class: 'lq-cls' }, 'Rung ' + rung) : null,
          h('span', { class: 'lp-count' }, isEnemy ? (deck.length + ' cards · 2 copies each = 30-card deck') : (deck.length + '-card singleton starter deck'))),
        pw ? h('p', { class: 'muted' }, h('strong', null, 'Hero Power — ' + pw.name + ': '), pw.text) : null,
        h('p', { class: 'muted' }, isEnemy
          ? `A static enemy faced as you Advance — no win-parity loot; its signature hero power gives it teeth.`
          : (secret ? `A secret hero, unlocked by clearing a full run (12 wins). Its loot buckets come from the ${clsName} class.`
            : `A Companion hero — one of the 10 offered at the start of a run. You grow this 10-card deck via a spoils draft + an alternating treasure/bucket each win. Its loot buckets come from the ${clsName} class.`)))),
    h('h2', null, 'Deck ', h('span', { class: 'num' }, '(' + deck.length + ' cards' + (isEnemy ? ' · ×2 = 30' : '') + ')')),
    cardSizeControl(grid), grid);
}

// ── Lorequest: Final Fantasy (FF) — mirrors the Sword Coast surfaces, tagged ffDeck/ffSide ──
function ffDeckCards(cards, ch) {
  return cards.filter(c => c.ffDeck === ch && !c.token)
    .sort((a, b) => ((b.rarity === 'legendary') - (a.rarity === 'legendary'))
      || Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
}
function ffTile(ch, deck, clsName, pw, colors) {
  const canvas = CardArt.drawCardFace(lqSig(deck));
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: ch, loading: 'lazy' });
  return h('a', { class: 'wiki-card lq-tile', href: '#/final-fantasy/' + lqSlug(ch), title: pw ? `${pw.name}: ${pw.text}` : ch },
    img,
    h('div', { class: 'lq-name' }, ch),
    h('div', { class: 'lq-sub' }, colorPips(colors), h('span', { class: 'lq-cls' }, clsName)));
}
async function finalFantasyView() {
  content.replaceChildren(h('h1', null, 'Lorequest: Final Fantasy'), h('p', { class: 'muted' }, 'Loading decks…'));
  let FF, classes, cards;
  try { [FF, classes, cards] = await Promise.all([loadFinalfantasy(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Lorequest: Final Fantasy'), h('p', { class: 'muted' }, 'Could not load the Final Fantasy data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'final-fantasy') return;
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase((id || '').replace(/_/g, ' '));
  const heroes = [...FF.HEROES, ...FF.SECRET_HEROES];
  const allChars = [...heroes, ...FF.ENEMIES];
  const decks = {}; for (const ch of allChars) decks[ch] = ffDeckCards(cards, ch);
  await CardArt.preloadArt(allChars.map(ch => lqSig(decks[ch])?.id).filter(Boolean));
  const group = (title, blurb, names) => h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + names.length + ')')),
      h('p', { class: 'muted' }, blurb)),
    h('div', { class: 'card-grid size-small' },
      ...names.map(ch => ffTile(ch, decks[ch], clsName(FF.classOf(ch)), FF.powerOf(ch), FF.colorsOf(ch)))));
  const totalCards = Object.values(decks).reduce((n, d) => n + d.length, 0);
  // FF-specific treasures — neutral rewards drafted on odd wins
  const treasures = cards.filter(c => c.ffTreasure).sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  await CardArt.preloadArt(treasures.map(CardArt.artIdOf));
  const treasureSection = h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, 'Treasures', ' ', h('span', { class: 'num' }, '(' + treasures.length + ')')),
      h('p', { class: 'muted' }, 'Powerful neutral treasures drafted on odd wins (with the shared treasure pool). Iconic FINAL FANTASY armaments & relics.')),
    h('div', { class: 'card-grid size-small' },
      ...treasures.map(c => { const canvas = CardArt.drawCardFace(c); return h('div', { class: 'wiki-card' }, h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: c.name, loading: 'lazy', title: c.description || c.name }), h('div', { class: 'lq-name' }, c.name)); })));
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Lorequest: Final Fantasy'),
        h('p', { class: 'muted' }, 'A dungeon run built from the MAGIC: THE GATHERING — FINAL FANTASY set art. Pick an FF hero (a 10-card starter deck) and battle the villains to 12 wins or 3 losses. Its signature mechanics are ', h('strong', null, 'Spiritsummon'), ' (call a random Spirit — Ifrit, Shiva, Bahamut…) and ', h('strong', null, 'Limit Break'), '. Like ', h('a', { href: '#/sword-coast' }, 'Sword Coast'), ', enemies are STATIC — each a 15-card deck run as 2 copies (30) with its own signature hero power; you grow your deck via a spoils draft + alternating treasure/bucket each win. Tap one to see its cards.')),
      h('div', { class: 'result-count' }, allChars.length, h('span', null, ' decks · ' + totalCards + ' cards · ' + treasures.length + ' treasures'))),
    group('Heroes — Warriors of Light', '11 heroes (Gilgamesh is a secret, unlocked by clearing a full run). Each is a 10-card singleton starter deck you grow as you climb.', heroes),
    group('Rung A — Henchmen', 'Your first fights (wins 0–2). Reno & Rude and Ultros appear only as your very first encounter.', FF.ENEMY_RUNGS.A),
    group('Rung B — Lieutenants', 'Empire generals and sorcerers (wins 3–6).', FF.ENEMY_RUNGS.B),
    group('Rung C — Archvillains', 'The named archvillains (wins 7–10).', FF.ENEMY_RUNGS.C),
    group('Rung D — Final Boss', 'The 12th-win final boss — Sephiroth and Chaos rotate for replay variety.', FF.ENEMY_RUNGS.D),
    treasureSection);
}
async function finalFantasyDeckDetail(slug) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading deck…'));
  let FF, classes, cards;
  try { [FF, classes, cards] = await Promise.all([loadFinalfantasy(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Final Fantasy Deck'), h('p', { class: 'muted' }, 'Could not load the Final Fantasy data.')); }
  const allChars = [...FF.HEROES, ...FF.SECRET_HEROES, ...FF.ENEMIES];
  const ch = allChars.find(x => lqSlug(x) === slug);
  if (!ch) return content.replaceChildren(h('h1', null, 'Deck not found'),
    h('p', null, h('a', { href: '#/final-fantasy' }, '← Back to Lorequest: Final Fantasy')));
  const deck = ffDeckCards(cards, ch);
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'final-fantasy') return;
  const byId = {}; for (const c of cards) byId[c.id] = c;
  await CardArt.preloadArt(deck.map(CardArt.artIdOf));
  const face = CardArt.drawCardFace(lqSig(deck)); face.className = 'wiki-face-big';
  const grid = await deckGrid(deck.map(c => c.id), byId);
  const clsName = (classes.find(c => c.id === FF.classOf(ch))?.name) || titleCase(FF.classOf(ch).replace(/_/g, ' '));
  const isEnemy = FF.isEnemy(ch);
  const secret = FF.SECRET_HEROES.includes(ch);
  const pw = FF.powerOf(ch);
  const rung = !isEnemy ? null
    : FF.ENEMY_RUNGS.A.includes(ch) ? 'A — Henchman' : FF.ENEMY_RUNGS.B.includes(ch) ? 'B — Lieutenant'
      : FF.ENEMY_RUNGS.C.includes(ch) ? 'C — Archvillain' : 'D — Final Boss';
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/final-fantasy' }, '← All Final Fantasy decks')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, ch),
        h('div', { class: 'lp-detail-meta' },
          colorPips(FF.colorsOf(ch)),
          h('span', { class: 'lq-cls' }, clsName),
          isEnemy ? h('span', { class: 'lq-cls' }, 'Rung ' + rung) : null,
          h('span', { class: 'lp-count' }, isEnemy ? (deck.length + ' cards · 2 copies each = 30-card deck') : (deck.length + '-card singleton starter deck'))),
        pw ? h('p', { class: 'muted' }, h('strong', null, 'Hero Power — ' + pw.name + ': '), pw.text) : null,
        h('p', { class: 'muted' }, isEnemy
          ? `A static enemy faced as you climb — no win-parity loot; its signature hero power gives it teeth.`
          : (secret ? `A secret hero, unlocked by clearing a full run (12 wins). Its loot buckets come from the ${clsName} class.`
            : `A Warrior of Light — one of the 10 offered at the start of a run. You grow this 10-card deck via a spoils draft + an alternating treasure/bucket each win. Its loot buckets come from the ${clsName} class.`)))),
    h('h2', null, 'Deck ', h('span', { class: 'num' }, '(' + deck.length + ' cards' + (isEnemy ? ' · ×2 = 30' : '') + ')')),
    cardSizeControl(grid), grid);
}

// ── Tempt ("The Ring tempts you") — the One Ring mechanic ──
async function temptView() {
  content.replaceChildren(h('h1', null, 'Tempt'), h('p', { class: 'muted' }, 'Loading…'));
  let cards;
  try { [cards] = await Promise.all([loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Tempt'), h('p', { class: 'muted' }, 'Could not load card data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'tempt') return;
  // every card that tempts you (One Rings + Sauron); show one face per distinct name (prefer the collectible/treasure printing)
  const all = cards.filter(c => JSON.stringify(c).includes('"tempt"'))
    .sort((a, b) => ((b.collectible !== false) - (a.collectible !== false)) || ((b.meTreasure ? 1 : 0) - (a.meTreasure ? 1 : 0)));
  const seen = new Set(), temptCards = all.filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  await CardArt.preloadArt(temptCards.map(c => c.id));
  const tier = (n, name, txt) => h('div', { class: 'lp-tier', style: 'display:flex;gap:14px;align-items:flex-start;padding:12px 14px;' },
    h('div', { style: 'flex:0 0 auto;width:40px;height:40px;border-radius:50%;background:#8a6f3a;color:#1c1830;font-weight:bold;display:flex;align-items:center;justify-content:center;' }, 'L' + n),
    h('div', null, h('div', { style: 'font-weight:bold;margin-bottom:2px;' }, name), h('div', { class: 'muted', style: 'font-size:.92em;line-height:1.35;' }, txt)));
  const faceOf = c => { const canvas = CardArt.drawCardFace(c); return h('a', { class: 'wiki-card', href: '#/cards/' + c.id, title: c.description || c.name }, h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: c.name, loading: 'lazy' }), h('div', { class: 'lq-name' }, c.name)); };
  content.replaceChildren(
    h('div', { class: 'gallery-heading' }, h('div', null,
      h('h1', null, 'Tempt'),
      h('p', { class: 'muted' }, 'Tempt is Magepunk’s take on Magic: The Gathering’s ', h('em', null, 'The Ring tempts you'), ': a per-player Ring that levels up and rides on one of your creatures — its ', h('b', null, 'Ring-bearer'), '.'))),
    h('section', { class: 'lp-tier' },
      h('div', { class: 'lp-tier-head' }, h('h2', null, 'How it works')),
      h('ul', { class: 'muted', style: 'line-height:1.5;' },
        h('li', null, 'Each time you are tempted, your Ring ', h('b', null, 'levels up by 1'), ' (up to a maximum of ', h('b', null, '4'), '). The tiers are ', h('b', null, 'cumulative'), '.'),
        h('li', null, 'You then choose a creature you control as your ', h('b', null, 'Ring-bearer'), ' — it immediately gains every tier your Ring has unlocked. With one creature it’s chosen automatically; with none, you simply level up.'),
        h('li', null, 'If your Ring-bearer leaves play, the Ring ', h('b', null, 'keeps its level'), ' — you choose a new bearer the next time you’re tempted.'))),
    h('section', { class: 'lp-tier' },
      h('div', { class: 'lp-tier-head' }, h('h2', null, 'The four tiers'), h('p', { class: 'muted' }, 'Each is granted once, and they stack on your Ring-bearer.')),
      h('div', { style: 'display:flex;flex-direction:column;gap:8px;max-width:660px;' },
        tier(1, 'Stealth', 'Your Ring-bearer gains Stealth — the enemy can’t attack or target it until it acts.'),
        tier(2, 'Loot on attack', 'Whenever your Ring-bearer attacks, loot: draw a card, then discard a card.'),
        tier(3, 'Deathtouch & +1/+1', 'Your Ring-bearer gains Deathtouch and a permanent +1/+1.'),
        tier(4, 'Corruption', 'Whenever your Ring-bearer damages a hero, each opponent loses 3 life.'))),
    h('section', { class: 'lp-tier' },
      h('div', { class: 'lp-tier-head' }, h('h2', null, 'Cards that tempt you'),
        h('p', { class: 'muted' }, 'The One Ring tempts you when it’s played, tapped, or at the start of your turn (depending on the card). Draft ', h('b', null, 'The One Ring'), ' in the ', h('a', { href: '#/middle-earth' }, 'Lorequest: Middle-earth'), ' run, or wield the collectible ', h('b', null, 'Sauron, Lord of the Rings'), ' in your own deck.')),
      h('div', { class: 'card-grid size-small' }, ...temptCards.map(faceOf))));
}

// ── Lorequest: Multiverse (Marvel, WIN-PARITY) ──
function mvDeckCards(cards, ch) {
  return cards.filter(c => c.mvDeck === ch && !c.token)
    .sort((a, b) => ((b.rarity === 'legendary') - (a.rarity === 'legendary'))
      || Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
}
function mvTile(ch, deck, clsName, pw, colors) {
  const canvas = CardArt.drawCardFace(lqSig(deck));
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: ch, loading: 'lazy' });
  return h('a', { class: 'wiki-card lq-tile', href: '#/multiverse/' + lqSlug(ch), title: pw ? `${pw.name}: ${pw.text}` : ch },
    img,
    h('div', { class: 'lq-name' }, ch),
    h('div', { class: 'lq-sub' }, colorPips(colors), h('span', { class: 'lq-cls' }, clsName)));
}
async function multiverseView() {
  content.replaceChildren(h('h1', null, 'Lorequest: Multiverse'), h('p', { class: 'muted' }, 'Loading decks…'));
  let MV, classes, cards;
  try { [MV, classes, cards] = await Promise.all([loadMultiverse(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Lorequest: Multiverse'), h('p', { class: 'muted' }, 'Could not load the Multiverse data.')); }
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'multiverse') return;
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase((id || '').replace(/_/g, ' '));
  const heroes = [...MV.HEROES, ...MV.SECRET_HEROES];
  const allChars = [...heroes, ...MV.ENEMIES];
  const decks = {}; for (const ch of allChars) decks[ch] = mvDeckCards(cards, ch);
  await CardArt.preloadArt(allChars.map(ch => lqSig(decks[ch])?.id).filter(Boolean));
  const group = (title, blurb, names) => h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + names.length + ')')),
      h('p', { class: 'muted' }, blurb)),
    h('div', { class: 'card-grid size-small' },
      ...names.map(ch => mvTile(ch, decks[ch], clsName(MV.classOf(ch)), MV.powerOf(ch), MV.colorsOf(ch)))));
  const totalCards = Object.values(decks).reduce((n, d) => n + d.length, 0);
  // Multiverse-specific treasures — neutral rewards drafted at milestone wins (2/5/8/11)
  const treasures = cards.filter(c => c.mvTreasure).sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  await CardArt.preloadArt(treasures.map(CardArt.artIdOf));
  const treasureSection = h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' },
      h('h2', null, 'Treasures', ' ', h('span', { class: 'num' }, '(' + treasures.length + ')')),
      h('p', { class: 'muted' }, 'Powerful neutral treasures drafted at milestone wins (2/5/8/11), alongside the shared treasure pool. Iconic MARVEL relics, vehicles & tech — and the enemy draws from the same pool at parity.')),
    h('div', { class: 'card-grid size-small' },
      ...treasures.map(c => { const canvas = CardArt.drawCardFace(c); return h('div', { class: 'wiki-card' }, h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: c.name, loading: 'lazy', title: c.description || c.name }), h('div', { class: 'lq-name' }, c.name)); })));
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Lorequest: Multiverse'),
        h('p', { class: 'muted' }, 'A dungeon run built from the MARVEL Magic: The Gathering set art (Spider-Man & Marvel Super Heroes). Pick a Marvel hero — a ', h('strong', null, '10-card'), ' starter deck with a unique hero power — and climb to 12 wins or 3 losses. Unlike the other Lorequest runs, Multiverse ', h('strong', null, 'returns to WIN-PARITY'), ': there is no spoils draft — every win YOU pick a class bucket (+ a treasure at wins 2/5/8/11), and the next villain is regenerated to hold the ', h('em', null, 'exact same'), ' bucket & treasure count you do, layered on its own 10-card base. So the enemy always scales with your loot. Tap one to see its cards.')),
      h('div', { class: 'result-count' }, allChars.length, h('span', null, ' decks · ' + totalCards + ' base cards · ' + treasures.length + ' treasures'))),
    group('Heroes — Earth’s Mightiest', '11 heroes (Silver Surfer is a secret, unlocked by clearing a full run). Each is a 10-card singleton starter you grow via buckets & treasures.', heroes),
    group('Street-Level — Rogues’ Gallery', 'Your first eight fights (wins 0–7). The classic Spider-Man rogues and street villains.', MV.ENEMY_RUNGS.STREET),
    group('Masterminds', 'The bigger threats (wins 8–10) — Doom, Loki, Kang, Abomination.', MV.ENEMY_RUNGS.MASTERMIND),
    group('Cosmic Threat — Final Boss', 'The 12th-win final boss — Thanos and Galactus rotate for replay variety.', MV.ENEMY_RUNGS.COSMIC),
    treasureSection);
}
async function multiverseDeckDetail(slug) {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading deck…'));
  let MV, classes, cards;
  try { [MV, classes, cards] = await Promise.all([loadMultiverse(), loadClasses(), loadCards(), loadCardart()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Multiverse Deck'), h('p', { class: 'muted' }, 'Could not load the Multiverse data.')); }
  const allChars = [...MV.HEROES, ...MV.SECRET_HEROES, ...MV.ENEMIES];
  const ch = allChars.find(x => lqSlug(x) === slug);
  if (!ch) return content.replaceChildren(h('h1', null, 'Deck not found'),
    h('p', null, h('a', { href: '#/multiverse' }, '← Back to Lorequest: Multiverse')));
  const deck = mvDeckCards(cards, ch);
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'multiverse') return;
  const byId = {}; for (const c of cards) byId[c.id] = c;
  await CardArt.preloadArt(deck.map(CardArt.artIdOf));
  const face = CardArt.drawCardFace(lqSig(deck)); face.className = 'wiki-face-big';
  const grid = await deckGrid(deck.map(c => c.id), byId);
  const clsName = (classes.find(c => c.id === MV.classOf(ch))?.name) || titleCase(MV.classOf(ch).replace(/_/g, ' '));
  const isEnemy = MV.isEnemy(ch);
  const secret = MV.SECRET_HEROES.includes(ch);
  const pw = MV.powerOf(ch);
  const rung = !isEnemy ? null
    : MV.ENEMY_RUNGS.STREET.includes(ch) ? 'Street-Level' : MV.ENEMY_RUNGS.MASTERMIND.includes(ch) ? 'Mastermind' : 'Cosmic Threat';
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/multiverse' }, '← All Multiverse decks')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, ch),
        h('div', { class: 'lp-detail-meta' },
          colorPips(MV.colorsOf(ch)),
          h('span', { class: 'lq-cls' }, clsName),
          isEnemy ? h('span', { class: 'lq-cls' }, rung) : null,
          h('span', { class: 'lp-count' }, deck.length + '-card base deck')),
        pw ? h('p', { class: 'muted' }, h('strong', null, 'Hero Power — ' + pw.name + ': '), pw.text) : null,
        h('p', { class: 'muted' }, isEnemy
          ? `A villain faced as you climb. Its 10-card base is shown here; at WIN-PARITY it also fields one class bucket per win you hold plus a treasure per milestone — so it always matches your loot.`
          : (secret ? `A secret hero, unlocked by clearing a full run (12 wins). Its loot buckets come from the ${clsName} class.`
            : `One of the 10 heroes offered at the start of a run. You grow this 10-card deck via a class bucket each win (+ a treasure at wins 2/5/8/11). Its loot buckets come from the ${clsName} class.`)))),
    h('h2', null, 'Base deck ', h('span', { class: 'num' }, '(' + deck.length + ' cards)')),
    cardSizeControl(grid), grid);
}

// ---- Arena: the pure-draft run (rules page; heroes/pool shared with Duels) ----
async function arenaView() {
  content.replaceChildren(h('p', { class: 'muted' }, 'Loading arena…'));
  let Du, classes;
  try { [Du, classes] = await Promise.all([loadDuels(), loadClasses()]); }
  catch (e) { return content.replaceChildren(h('h1', null, 'Arena'), h('p', { class: 'muted' }, 'Could not load the duels data.')); }
  const clsName = id => (classes.find(c => c.id === id)?.name) || titleCase(id);
  const heroCards = Du.HEROES.map(hero => h('a', {
    class: 'wiki-card', href: '#/duels/hero/' + hero.id, title: hero.flavor,
    style: 'display:flex;flex-direction:column;align-items:center;gap:6px;width:120px;text-decoration:none;',
  },
    duelsPortrait(hero.id, 88),
    h('div', { style: 'font-weight:bold;text-align:center;font-size:13px;' }, hero.name),
    h('div', { class: 'muted', style: 'font-size:11.5px;' }, Du.classChoicesOf(hero)
      ? `choose 1 of ${Du.classChoicesOf(hero).length} classes`
      : Du.classesOf(hero).map(clsName).join(' / '))));
  content.replaceChildren(
    h('h1', null, 'Arena'),
    h('p', null, 'The pure draft gauntlet: pick a hero, draft a 30-card deck one pick at a time (1 of 3 per pick, ',
      'rarity-weighted from your classes), then run it against auto-drafted rivals until 3 losses. ',
      '12 wins is a flawless run.'),
    h('p', { class: 'muted' }, 'Unlike ', h('a', { href: '#/duels' }, 'Duels'),
      ', your deck is FIXED at the drafted 30 — no loot buckets, treasures, or passives between fights. ',
      'Rivals draft the same way you do, so every game is decks-even. Runs post to the in-game leaderboard.'),
    h('h2', null, 'Heroes ', h('span', { class: 'num' }, '(' + Du.HEROES.length + ')')),
    h('p', { class: 'muted' }, 'The hero roster and draft pool are shared with Duels — hero pages list each one’s powers and classes.'),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:14px;' }, ...heroCards));
}

// ---------- Controls: keyboard, touch, and controller (Plans/CONTROLLER_SUPPORT_PLAN.md) ----------
function controlsView() {
  const table = (head, rows) => h('table', null,
    h('thead', null, h('tr', null, ...head.map(c => h('th', null, c)))),
    h('tbody', null, ...rows.map(r => h('tr', null, ...r.map(c => h('td', null, c))))));
  const section = (title, sub, ...kids) => h('section', { class: 'lp-tier' },
    h('div', { class: 'lp-tier-head' }, h('h2', null, title), sub ? h('p', { class: 'muted' }, sub) : null), ...kids);
  content.replaceChildren(
    h('h1', null, 'Controls'),
    h('p', { class: 'muted' }, 'Every mode plays with a keyboard, a mouse or touch, or a game controller. ',
      h('b', null, 'Controller play is for everyone, signed in or not.'),
      ' The standard layout is Nintendo-style: the RIGHT face button confirms and the BOTTOM one cancels. On a Switch pad that reads A / B; on Xbox, B / A; on PlayStation, ○ / ✕. Switch to the Xbox layout, remap any button, or turn rumble on in the overworld under OPTIONS → CONTROLS (the setting applies everywhere).'),
    section('Overworld and Pokémon battles', 'Buttons by position; the hint bar at the bottom shows the names for the pad you are holding.',
      table(['Button', 'Roaming', 'Menus and battles'], [
        ['Stick / D-pad', 'Walk', 'Move the cursor (held = scroll)'],
        ['Right face (confirm)', 'Talk / interact', 'Select'],
        ['Bottom face (cancel)', 'Hold to run', 'Back'],
        ['Start', 'Start menu', '—'],
        ['Select', 'Party', 'PC: release · Pokédex: grid view'],
        ['Top face', 'Bag', 'PC: switch side · Pokédex: caught filter · Shop: buy ↔ sell'],
        ['Left face (context)', 'Bike', 'Battle: throw last ball / swap moves · PC: sort · Party: take item · Summary: make lead · Pokédex: type filter'],
        ['LB / RB', '—', 'Page left / right (PC boxes, Pokédex regions, town map)'],
      ])),
    section('Battlecards menus and screens', 'The lobby, run-mode screens, pop-ups (mulligan, discover, discard, choose-one), the deck builder, gallery, packs and replays.',
      table(['Button', 'Action'], [
        ['Stick / D-pad', 'Move focus to the nearest button, card or field'],
        ['Right face (confirm)', 'Activate. A text field opens the on-screen keyboard; a dropdown cycles its options'],
        ['Bottom face (cancel)', 'Back / close'],
        ['LB / RB', 'Page left / right, replay steps'],
        ['Start', 'Open a pack, play / pause a replay'],
      ])),
    section('Battlecards match board', 'A gold reticle marks the focused card; while targeting it turns red and the arrow follows it.',
      table(['Button', 'Action'], [
        ['Stick / D-pad', 'Move between cards in your hand, both boards, the heroes, your hero power, and the End Turn / Log buttons'],
        ['LB / RB', 'Jump between your hand, your side, the enemy side, and the buttons (starting on End Turn)'],
        ['Right face (confirm)', 'Play a hand card (creatures then pick a board slot with ◄ ►), arm an attack, pick the target, use your hero power, or press the focused button (End Turn, Log)'],
        ['Bottom face (cancel)', 'Back out of placing or targeting'],
        ['Left face', 'Read the focused card in the large focus view (◄ ► / LB RB step through the cards beside it; cancel closes). Confirm on a card you cannot act on opens it too'],
        ['Start', 'Menu: game log, auto-pass, sound, concede'],
        ['Game log', 'Card names are links: confirm on one to read the card. Right stick scrolls; cancel closes'],
      ])),
    section('Typing on a controller', 'Nicknames, friend codes, searches and pasted deck or replay codes use the on-screen keyboard.',
      table(['Button', 'Action'], [
        ['D-pad', 'Move over the keys'],
        ['Right face', 'Type the focused key'],
        ['Bottom face', 'Delete (on an empty field: close)'],
        ['Start', 'OK'],
        ['Top face / left face', 'Space / Shift'],
      ])));
}

function route() {
  const rawHash = location.hash.slice(1) || '/';
  const hash = rawHash.split('?')[0];
  const parts = hash.split('/').filter(Boolean);
  // a link to this exact page wins; otherwise the section's top link lights up (#/cards/x -> Card Gallery)
  const navLinks = [...document.querySelectorAll('#sidebar a')];
  const exact = navLinks.some(a => a.getAttribute('href') === '#' + hash);
  navLinks.forEach(a =>
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash || (!exact && a.getAttribute('href') === '#/' + parts[0])));
  if (parts.length === 0) return home();
  const [section, id] = parts;
  if (section === 'pokemon') return id ? pokemonDetail(id) : pokedexView();
  if (section === 'needs-typing') return needsTypingView();
  if (section === 'needs-data') return needsDataView();
  if (section === 'moves') return id ? moveDetail(id) :
    listView('moves', 'Moves', Object.values(DB.moves).sort(byName));
  if (section === 'abilities') return id ? abilityDetail(id) :
    listView('abilities', 'Abilities', Object.values(DB.abilities).map(a => ({ ...a, sub: (a.pokemon || []).length + ' Pokémon' })).sort(byName));
  if (section === 'tms') return tmsView();
  if (section === 'unlearned') return unlearnedView();
  if (section === 'controls') return controlsView();
  if (section === 'region') return regionView(id);
  if (section === 'cards') return id ? cardDetail(id) : cardGalleryView();
  if (section === 'land-pools') return id ? landPoolDetail(id) : landPoolsView();
  if (section === 'correspondence') return correspondenceView();
  if (section === 'lore-decks') return id ? lorequestDeckDetail(id) : lorequestView();
  if (section === 'middle-earth') return id ? middleEarthDeckDetail(id) : middleEarthView();
  if (section === 'sword-coast') return id ? swordCoastDeckDetail(id) : swordCoastView();
  if (section === 'final-fantasy') return id ? finalFantasyDeckDetail(id) : finalFantasyView();
  if (section === 'multiverse') return id ? multiverseDeckDetail(id) : multiverseView();
  if (section === 'tempt') return temptView();
  if (section === 'arena') return arenaView();
  if (section === 'missing-art') return missingArtView();
  if (section === 'missing-cries') return missingCriesView();
  if (section === 'dungeon') {
    if (id === 'deck' && parts[2]) return dungeonDeckView(parts[2]);
    if (id === 'boss' && parts[2]) return dungeonBossView(parts[2]);
    return dungeonView();
  }
  if (section === 'heist') {
    if (id === 'hero' && parts[2]) return heistHeroView(parts[2]);
    if (id === 'boss' && parts[2]) return heistBossView(parts[2]);
    if (id === 'treasures') return heistTreasuresView();
    return heistView();
  }
  if (section === 'tombs') {
    if (id === 'explorer' && parts[2]) return tombsExplorerView(parts[2]);
    if (id === 'boss' && parts[2]) return tombsBossView(parts[2]);
    if (id === 'treasures') return tombsTreasuresView();
    return tombsView();
  }
  if (section === 'duels') {
    if (id === 'hero' && parts[2]) return duelsHeroView(parts[2]);
    if (id === 'treasures') return duelsTreasuresView();
    return duelsView();
  }
  if (section === 'keyword') return cardSubsetView('keyword', id);
  if (section === 'tribe') return cardSubsetView('tribe', id);
  if (section === 'school') return cardSubsetView('school', id);
  if (section === 'type') return cardSubsetView('type', id);
  if (section === 'contraptions') return contraptionsView();
  if (section === 'dungeons') return dungeonsView();
  if (section === 'battlecards') return id ? designCardDetail(id) : battlecardsView();
  if (section === 'micatro') return micatroRoute(id, parts[2]);
  if (section === 'micatro-mods') return micatroModsRoute(id, parts[2]);
  if (section === 'micasurvivor') return micasurvivorRoute(id);
  if (section === 'search') return globalSearchView();
  notFound();
}

let cardSearchTimer = null;
searchEl.addEventListener('input', () => {
  const s = (location.hash.slice(1).split('?')[0] || '/').split('/').filter(Boolean);
  if (['pokemon', 'moves', 'abilities', 'tms', 'unlearned', 'battlecards', 'cards', 'missing-art', 'missing-cries', 'needs-typing', 'needs-data'].includes(s[0]) && !s[1]) {
    if (s[0] === 'cards') {
      clearTimeout(cardSearchTimer);
      cardSearchTimer = setTimeout(() => {
        syncCardFilterUrl();
        Promise.all([loadCards(), loadArtAudit().catch(() => ({})), loadCardart().then(() => null)])
          .then(([cards, report]) => renderCards(cards, report));
      }, 120);
      return;
    }
    route();
    return;
  }
  // anywhere else: the wiki-wide results page (#/search?q=); typing on it rewrites its own hash in place
  clearTimeout(globalSearchTimer);
  globalSearchTimer = setTimeout(() => {
    const q = searchEl.value.trim();
    const target = '#/search' + (q ? '?q=' + encodeURIComponent(q) : '');
    if (s[0] === 'search') { history.replaceState(null, '', target); globalSearchView(); }
    else if (q) location.hash = target;
  }, 150);
});
let globalSearchTimer = null;
window.addEventListener('hashchange', route);

// ---- mobile nav drawer: hamburger toggles an off-canvas sidebar ----
(function wireNavDrawer() {
  const toggle = document.getElementById('navToggle');
  const scrim = document.getElementById('navScrim');
  const sidebar = document.getElementById('sidebar');
  const setNav = open => document.body.classList.toggle('nav-open', open);
  if (toggle) toggle.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  if (scrim) scrim.addEventListener('click', () => setNav(false));
  if (sidebar) sidebar.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
  window.addEventListener('hashchange', () => setNav(false));
})();

(async function init() {
  try {
    const [pk, mv, ab, rg, tm, bc] = await Promise.all(['pokemon', 'moves', 'abilities', 'regions', 'tms', 'battlecards']
      .map(n => fetch('data/' + n + '.json' + CB).then(r => r.json())));
    DB.pokemon = pk; DB.moves = mv; DB.abilities = ab; DB.regions = rg; DB.tms = tm; DB.battlecards = bc;
    for (const id in DB.pokemon) DB.pokemon[id].id = id;
    for (const id in DB.moves) DB.moves[id].id = id;
    for (const id in DB.abilities) { DB.abilities[id].id = id; abilityByName[norm(DB.abilities[id].name)] = id; abilityByName[norm(id)] = id; }
    statusEl.textContent = Object.keys(pk).length + ' Pokémon';
    route();
  } catch (e) {
    content.replaceChildren(h('h1', null, 'Failed to load data'), h('pre', null, String(e)));
  }
})();
