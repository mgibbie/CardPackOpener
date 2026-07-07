'use strict';
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

function pokemonDetail(id) {
  const p = DB.pokemon[id]; if (!p) return notFound();
  const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const moveSection = (title, list) => (list && list.length) ? [
    h('h2', null, title, ' ', h('span', { class: 'num' }, '(' + list.length + ')')),
    h('div', null, list.map((m, i) => [i ? ', ' : '', mvLink(m)]).flat())
  ] : [];
  content.replaceChildren(
    h('h1', null, h('span', { class: 'num' }, '#' + (p.num ?? '?') + ' '), p.name),
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


// Battlecards design-work backlog: every card name held without a working
// design, plus undefined keywords. Data from designwiki/data/battlecards.json
// (regenerate with Magepunk66/tools/gen_battlecards_design.py).
function battlecardsView() {
  const db = DB.battlecards;
  if (!db) return content.replaceChildren(h('h1', null, 'Battlecards data not loaded'));
  const q = norm(searchEl.value);
  const total = db.sections.reduce((a, s) => a + s.count, 0);
  const blocks = db.sections.map(s => {
    const items = q ? s.items.filter(it => norm(it.name).includes(q) || norm(it.note || '').includes(q)) : s.items;
    return h('details', { class: 'route', open: q ? true : null },
      h('summary', null, h('strong', null, s.title + ' '), h('span', { class: 'num' }, '(' + items.length + ')')),
      h('p', { class: 'muted' }, s.blurb),
      h('div', { class: 'grid' }, items.map(it =>
        h('div', { class: 'card' },
          h('div', { class: 'nm' }, it.name),
          it.note ? h('div', { class: 'muted', style: 'font-size:12px' }, it.note) : null))));
  });
  content.replaceChildren(
    h('h1', null, 'Battlecards — Design Work ', h('span', { class: 'num' }, '(' + total + ' items)')),
    h('p', { class: 'muted' }, 'Everything named but not yet designed or functional: undefined keywords, pending paper cards, WUBRG cards awaiting redesigns or engine work, the advanced-land theme pools, and classes without card lists. Search filters every section.'),
    ...blocks);
}

function notFound() { content.replaceChildren(h('h1', null, 'Not found')); }
function home() {
  content.replaceChildren(h('h1', null, 'Magepunk66 Design Wiki'),
    h('p', null, 'Reference for Pokémon, moves, abilities, and per-region encounters & trainers.'),
    h('p', { class: 'muted' }, Object.keys(DB.pokemon).length + ' Pokémon · ' +
      Object.keys(DB.moves).length + ' moves · ' + Object.keys(DB.abilities).length + ' abilities'),
    h('p', { class: 'muted' }, 'To change content, edit the JSON files in designwiki/data/ in the repository.'));
}

function route() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  document.querySelectorAll('#sidebar a').forEach(a =>
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash || a.getAttribute('href') === '#/' + parts[0]));
  if (parts.length === 0) return home();
  const [section, id] = parts;
  if (section === 'pokemon') return id ? pokemonDetail(id) :
    listView('pokemon', 'Pokémon', Object.values(DB.pokemon).sort(byDex));
  if (section === 'moves') return id ? moveDetail(id) :
    listView('moves', 'Moves', Object.values(DB.moves).sort(byName));
  if (section === 'abilities') return id ? abilityDetail(id) :
    listView('abilities', 'Abilities', Object.values(DB.abilities).map(a => ({ ...a, sub: (a.pokemon || []).length + ' Pokémon' })).sort(byName));
  if (section === 'tms') return tmsView();
  if (section === 'unlearned') return unlearnedView();
  if (section === 'region') return regionView(id);
  if (section === 'battlecards') return battlecardsView();
  notFound();
}

searchEl.addEventListener('input', () => {
  const s = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  if (['pokemon', 'moves', 'abilities', 'tms', 'unlearned', 'battlecards'].includes(s[0]) && !s[1]) route();
});
window.addEventListener('hashchange', route);

(async function init() {
  try {
    const [pk, mv, ab, rg, tm, bc] = await Promise.all(['pokemon', 'moves', 'abilities', 'regions', 'tms', 'battlecards']
      .map(n => fetch('data/' + n + '.json').then(r => r.json())));
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
