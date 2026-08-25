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
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
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
let cardsPromise = null, cardartPromise = null, artAuditPromise = null, CardArt = null, CardKw = null, kwIndex = null;
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
const colorChip = (code, card) => h('a', { class: 'tag-chip color', href: card?.type === 'land' ? '#/cards?class=__land__' : '#/cards?color=' + encodeURIComponent(code) }, colorName(code));
// small WUBRG(C) mana pips for the Land Pools views
const COLOR_PIP_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];
function colorPips(cols) {
  const use = COLOR_PIP_ORDER.filter(c => (cols || []).includes(c));
  return h('span', { class: 'lp-pips' }, ...(use.length ? use : ['C']).map(c => h('span', { class: 'pip pip-' + c, title: colorName(c) })));
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
    await CardArt.preloadArt(batch.map(c => c.id));
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
  let cards, report;
  try {
    [cards, report] = await Promise.all([loadCards(), loadArtAudit(), loadCardart().then(() => null)]);
  } catch (e) {
    return content.replaceChildren(h('h1', null, 'Cards Missing Art'), h('p', { class: 'muted' }, 'Could not load the artwork audit.'));
  }
  if ((location.hash.slice(1).split('/').filter(Boolean))[0] !== 'missing-art') return;

  const unresolved = [...(report.wikiNotFound || []), ...(report.errors || [])];
  const ids = new Set(unresolved.map(x => x.id).filter(Boolean));
  const cardsById = new Map(cards.map(c => [c.id, c]));
  const q = norm(searchEl.value);
  const list = [...ids].map(id => cardsById.get(id)).filter(Boolean)
    .filter(c => !q || norm(c.name).includes(q) || norm(c.id).includes(q) || norm(c.cardClass).includes(q) || norm(c.type).includes(q))
    .sort((a, b) => canonClass(a).localeCompare(canonClass(b)) || String(a.name).localeCompare(String(b.name)));

  await CardArt.preloadArt(list.map(c => c.id));
  const temporary = new Set((report.errors || []).map(x => x.id)).size;
  content.replaceChildren(
    h('h1', null, 'Cards Missing Art ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('p', { class: 'muted' }, 'Cards without a sourced full-art image in the latest audit of ' + (report.cardCount || cards.length) + ' cards. Click a card to inspect its wiki page.'),
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
  await CardArt.preloadArt([id]);
  const face = CardArt.drawCardFace(c); face.className = 'wiki-face-big';
  const stats = ['Cost ' + (c.cost ?? 0)];
  if (c.type === 'creature') stats.push((c.attack ?? '?') + ' / ' + (c.health ?? '?'));
  else if (c.type === 'weapon') stats.push(c.attack + ' attack · ' + c.durability + ' durability');
  else if (c.type === 'location') stats.push((c.durability ?? 0) + ' uses');
  else if (c.type === 'planeswalker') stats.push((c.loyalty ?? 0) + ' loyalty');
  const kws = CardKw.keywordsFor(c);
  const artCanvas = CardArt.drawArt(c); artCanvas.className = 'wiki-art-solo';
  // generated-card relations: what this card creates, and what creates it
  const byId = {}; for (const x of cards) byId[x.id] = x;
  const cardLink = gid => h('a', { class: 'tag-chip', href: '#/cards/' + gid + cardQuerySuffix() },
    (byId[gid].name || gid) + ' (' + (byId[gid].cost ?? 0) + (byId[gid].type === 'creature' ? ' · ' + (byId[gid].attack ?? '?') + '/' + (byId[gid].health ?? '?') : '') + ')');
  const generates = CardArt.generatedCardIds(c, byId);
  const createdBy = CardArt.createdByIds(c.id, byId);
  const metaBucket = systemBucket(c);
  const metaSystem = SYSTEM_BUCKETS.find(([key]) => key === metaBucket);
  const metaClassValue = metaSystem ? metaSystem[0] : canonClass(c);
  const metaClassLabel = metaSystem ? metaSystem[1] : CardArt.classNameOf(c.cardClass);
  const colorMeta = displayColorsOf(c).filter(code => COLOR_NAMES[code]).map((code, i) =>
    [i ? ' / ' : ' · ', h('a', { href: c.type === 'land' ? '#/cards?class=__land__' : '#/cards?color=' + encodeURIComponent(code) }, colorName(code))]).flat();
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
        generates.length ? h('h2', null, 'Generates') : null,
        generates.length ? h('div', { class: 'card-tags' }, generates.map(cardLink)) : null,
        // and the reverse: which cards create THIS one
        createdBy.length ? h('h2', null, 'Created by') : null,
        createdBy.length ? h('div', { class: 'card-tags' }, createdBy.map(cardLink)) : null)),
    // the card's illustration on its own, no frame
    h('div', { class: 'card-art-section' }, h('h2', null, 'Art'), artCanvas),
    h('p', null, h('a', { href: '#/cards' + cardQuerySuffix() }, '← Back to filtered gallery')));
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
    await CardArt.preloadArt(batch.map(c => c.id));
    grid.append(...batch.map(cardTile));
    shown += batch.length;
    if (shown >= list.length) more.remove(); else more.textContent = 'Show more (' + (list.length - shown) + ' hidden)';
  };
  more.addEventListener('click', renderMore);
  content.replaceChildren(
    h('h1', null, title + ' ', h('span', { class: 'num' }, '(' + list.length + ')')),
    blurb ? h('p', { class: 'muted' }, blurb) : null,
    h('p', null, h('a', { href: '#/cards' + cardQuerySuffix() }, '← Back to filtered gallery')),
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
  await CardArt.preloadArt(list.map(c => c.id));
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
  await CardArt.preloadArt(uniq.filter(Boolean).map(c => c.id));
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
  const powers = [primaryCls?.power ? { name: primaryCls.power.name, cost: primaryCls.power.cost, text: primaryCls.power.text } : null,
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
    try { await art.preloadArt([impl.id]); face = art.drawCardFace(impl); face.className = 'wiki-face-big'; } catch (e) {}
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

function notFound() { content.replaceChildren(h('h1', null, 'Not found')); }
function home() {
  content.replaceChildren(h('h1', null, 'Magepunk66 Design Wiki'),
    h('p', null, 'Reference for Pokémon, moves, abilities, and per-region encounters & trainers.'),
    h('p', { class: 'muted' }, Object.keys(DB.pokemon).length + ' Pokémon · ' +
      Object.keys(DB.moves).length + ' moves · ' + Object.keys(DB.abilities).length + ' abilities'),
    h('p', { class: 'muted' }, 'To change content, edit the JSON files in designwiki/data/ in the repository.'));
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
  const pool = cards.filter(c => c.landSet === info.landSet && !c.token)
    .sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name).localeCompare(String(b.name)));
  if ((location.hash.slice(1).split('?')[0].split('/').filter(Boolean))[0] !== 'land-pools') return;
  await CardArt.preloadArt([land.id, ...pool.map(c => c.id)]);
  const face = CardArt.drawCardFace(land); face.className = 'wiki-face-big';
  const tapLines = (land.description || '').split('\n').filter(Boolean);
  content.replaceChildren(
    h('p', { class: 'lp-back' }, h('a', { href: '#/land-pools' }, '← All Land Pools')),
    h('div', { class: 'lp-detail-head' },
      h('div', { class: 'lp-detail-face' }, face),
      h('div', { class: 'lp-detail-info' },
        h('h1', null, land.name),
        h('div', { class: 'lp-detail-meta' }, colorPips(info.colors), h('span', { class: 'lp-count' }, pool.length + ' cards in pool')),
        h('ul', { class: 'lp-taps' }, ...tapLines.map(t => h('li', null, t))))),
    pool.length ? h('div', { class: 'card-grid size-medium' }, ...pool.map(cardTile))
      : h('p', { class: 'muted' }, 'This land has no pool cards yet.'));
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
  await CardArt.preloadArt(deck.map(c => c.id));
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
function meTile(ch, deck, clsName, pw) {
  const canvas = CardArt.drawCardFace(lqSig(deck));
  const img = h('img', { class: 'wiki-face', src: canvas.toDataURL(), alt: ch, loading: 'lazy' });
  return h('a', { class: 'wiki-card lq-tile', href: '#/middle-earth/' + lqSlug(ch), title: pw ? `${pw.name}: ${pw.text}` : ch },
    img,
    h('div', { class: 'lq-name' }, ch),
    h('div', { class: 'lq-sub' }, h('span', { class: 'lq-cls' }, clsName)));
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
      ...names.map(ch => meTile(ch, decks[ch], clsName(ME.classOf(ch)), ME.powerOf(ch)))));
  const totalCards = Object.values(decks).reduce((n, d) => n + d.length, 0);
  content.replaceChildren(
    h('div', { class: 'gallery-heading' },
      h('div', null, h('h1', null, 'Lorequest: Middle-earth'),
        h('p', { class: 'muted' }, 'A LOTR/Hobbit dungeon run. Pick a hero of the Free Peoples (a 10-card starter deck) and climb the rungs of Sauron’s forces to 12 wins or 3 losses. Unlike ', h('a', { href: '#/duels' }, 'Duels'), ', enemies are STATIC — each a 15-card deck run as 2 copies (30), with its own signature hero power; you grow your deck via a spoils draft + alternating treasure/bucket each win. Tap one to see its cards.')),
      h('div', { class: 'result-count' }, allChars.length, h('span', null, ' decks · ' + totalCards + ' cards'))),
    group('Heroes — Free Peoples', '11 heroes (Tom Bombadil is a secret, unlocked by clearing a full run). Each is a 10-card singleton starter deck you grow as you win.', heroes),
    group('Rung A — Mooks', 'Your first fights (wins 0–2). Bill Ferny & Lotho appear only as your very first encounter.', ME.ENEMY_RUNGS.A),
    group('Rung B — Lieutenants', 'Captains and monsters (wins 3–6).', ME.ENEMY_RUNGS.B),
    group('Rung C — Commanders', 'The named boss commanders (wins 7–10).', ME.ENEMY_RUNGS.C),
    group('Rung D — The Dark Lord', 'The 12th-win final boss — the two Saurons rotate for replay variety.', ME.ENEMY_RUNGS.D));
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
  await CardArt.preloadArt(deck.map(c => c.id));
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

function route() {
  const rawHash = location.hash.slice(1) || '/';
  const hash = rawHash.split('?')[0];
  const parts = hash.split('/').filter(Boolean);
  document.querySelectorAll('#sidebar a').forEach(a =>
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash || a.getAttribute('href') === '#/' + parts[0]));
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
  if (section === 'region') return regionView(id);
  if (section === 'cards') return id ? cardDetail(id) : cardGalleryView();
  if (section === 'land-pools') return id ? landPoolDetail(id) : landPoolsView();
  if (section === 'lore-decks') return id ? lorequestDeckDetail(id) : lorequestView();
  if (section === 'middle-earth') return id ? middleEarthDeckDetail(id) : middleEarthView();
  if (section === 'missing-art') return missingArtView();
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
  notFound();
}

let cardSearchTimer = null;
searchEl.addEventListener('input', () => {
  const s = (location.hash.slice(1).split('?')[0] || '/').split('/').filter(Boolean);
  if (['pokemon', 'moves', 'abilities', 'tms', 'unlearned', 'battlecards', 'cards', 'missing-art', 'needs-typing', 'needs-data'].includes(s[0]) && !s[1]) {
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
  }
});
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
