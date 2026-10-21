// Add-on dedupe follow-ups (Pokermon PORTING.md "Add-on dedupe (Pokermon precedence)", owner calls 3 and 4):
//   - win stickers MERGE at read time: a sticker stored on a superseded legacy key (j_nacho_ralts, j_sonfive_shedinja)
//     counts toward its Pokermon twin (j_poke_ralts) — max per category — in winRecord / winLevel / winStickerInfo (the
//     joker in game, the collection / Pokédex) and stickerMap (what a spectator / replay is sent); the stored record is
//     never rewritten and the legacy key keeps its own
//   - a category revoked on the twin stays revoked whatever the legacy key holds (own record, and a watched player's
//     via setStickerSource's `revoked` / stickerRevokedMap)
//   - a NEW win with a legacy card records on both keys
//   - the static table micatro/js/mods/superseded.js matches the game's detection (precedence.js replaced_by) with every
//     shipped mod loaded (regenerate: node tools/micatro/gen_superseded.mjs)
//   - Pokermon+'s "Nincada line" option is hidden from the option list, its stored value still read
//   node micatro/tests/mods/addon_sticker_merge_test.mjs
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 300)); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { P_CENTERS } = await import('../../js/engine/core.js');
const { newRun } = await import('../../js/engine/run.js');
const { opt } = await import('../../js/mods/registry.js');
const MODS = await import('../../js/mods/index.js');
for (const m of MODS.AVAILABLE) await m.load();   // every shipped mod, as the generator loads them
const P = await import('../../mods/pokermon/api.js');
const S = await import('../../js/ui/stickers.js');
let SUP = null;
try { SUP = await import('../../js/mods/superseded.js'); } catch (e) { /* missing before the follow-up */ }

const DUPES = {
  j_nacho_ralts: 'j_poke_ralts', j_nacho_kirlia: 'j_poke_kirlia', j_nacho_gardevoir: 'j_poke_gardevoir', j_nacho_gallade: 'j_poke_gallade',
  j_nacho_swablu: 'j_poke_swablu', j_nacho_altaria: 'j_poke_altaria',
  j_nacho_bagon: 'j_poke_bagon', j_nacho_shelgon: 'j_poke_shelgon', j_nacho_salamence: 'j_poke_salamence',
  j_sonfive_nincada: 'j_poke_nincada', j_sonfive_ninjask: 'j_poke_ninjask', j_sonfive_shedinja: 'j_poke_shedinja',
};
const LOCAL = (u) => 'micatro_joker_wins_v1:' + u;
const local = (u) => JSON.parse(store.get(LOCAL(u)) || '{}');

// ===================================================================== the static table = the detection
await sec('superseded table', () => {
  ok(!!SUP, 'micatro/js/mods/superseded.js exists (node tools/micatro/gen_superseded.mjs)');
  if (!SUP) return;
  const detected = {};
  for (const k of Object.keys(P_CENTERS).sort()) { const to = P.replaced_by(k); if (to) detected[k] = to; }
  ok(same(SUP.SUPERSEDED, detected), 'superseded.js matches replaced_by over every registered card (all shipped mods): regenerate with node tools/micatro/gen_superseded.mjs', { table: SUP.SUPERSEDED, detected });
  ok(Object.keys(DUPES).every((k) => SUP.supersededBy(k) === DUPES[k]) && Object.keys(SUP.SUPERSEDED).length === 12, 'the 12 known duplicates');
  ok(same(SUP.supersededFrom('j_poke_ralts'), ['j_nacho_ralts']) && same(SUP.supersededFrom('j_joker'), []) && SUP.supersededBy('j_poke_ralts') === undefined, 'supersededFrom / supersededBy');
});

// ===================================================================== read-time merge (a guest's own record)
await sec('merge', () => {
  const stored = {
    j_nacho_ralts: { win: 3 },                          // only a legacy win: shows on Pokermon's Ralts
    j_nacho_gardevoir: { win: 5, nuz: 2 }, j_poke_gardevoir: { win: 3, mono: 4 },   // max per category
    j_sonfive_shedinja: { poke: 6 }, j_poke_shedinja: { poke: 2, win: 7 },
    j_joker: { win: 1 },
  };
  store.set(LOCAL('guest'), JSON.stringify(stored));
  S.initWinStickers('guest');
  ok(same(S.winRecord('j_poke_ralts'), { win: 3 }) && S.winLevel('j_poke_ralts') === 3, 'a Nacho Ralts win counts as a Ralts win (j_poke_ralts)', S.winRecord('j_poke_ralts'));
  const ri = S.winStickerInfo('j_poke_ralts', true);
  ok(ri && ri.stake === 'Green' && ri.category === 'win', "Pokermon's Ralts wears the Green sticker (collection / Pokédex)", ri);
  ok(S.winStickerInfo('j_poke_ralts', false) && S.winStickerInfo('j_poke_ralts', false).stake === 'Green', '... and on the table');
  ok(same(S.winRecord('j_poke_gardevoir'), { win: 5, mono: 4, nuz: 2 }) || same(S.winRecord('j_poke_gardevoir'), { win: 5, nuz: 2, mono: 4 }), 'max per category: Gardevoir {win 5 (Nacho), nuz 2 (Nacho), mono 4 (Pokermon)}', S.winRecord('j_poke_gardevoir'));
  ok(S.winStickerInfo('j_poke_gardevoir', true).category === 'mono', 'its sticker follows the merged record (Ambipom)');
  ok(S.winRecord('j_poke_shedinja').poke === 6 && S.winRecord('j_poke_shedinja').win === 7, "Pokermon+'s Shedinja counts toward Pokermon's", S.winRecord('j_poke_shedinja'));
  ok(same(S.winRecord('j_nacho_ralts'), { win: 3 }) && same(S.winRecord('j_nacho_gardevoir'), { win: 5, nuz: 2 }), 'the legacy keys keep their own record (no merge the other way)');
  ok(S.winLevel('j_poke_kirlia') === 0 && same(S.winRecord('j_joker'), { win: 1 }), 'other keys untouched');
  ok(same(local('guest'), stored), 'nothing stored is rewritten (read-time merge)', local('guest'));
  const m = S.stickerMap(['j_poke_ralts', 'j_poke_gardevoir', 'j_nacho_ralts']);
  ok(same(m.j_poke_ralts, { win: 3 }) && m.j_poke_gardevoir.nuz === 2 && m.j_poke_gardevoir.mono === 4 && same(m.j_nacho_ralts, { win: 3 }), 'stickerMap (spectate / replays) sends the merged records', m);
});

// ===================================================================== a new win with a legacy card: recorded on both keys
await sec('record', () => {
  store.clear();
  S.initWinStickers('guest');
  const n = S.recordWin({ jokers: ['j_nacho_kirlia', 'j_sonfive_ninjask', 'j_joker'], stake: 6, categories: ['win', 'poke'] });
  const l = local('guest');
  ok(same(l.j_nacho_kirlia, { win: 6, poke: 6 }) && same(l.j_poke_kirlia, { win: 6, poke: 6 }), 'a win holding Nacho Kirlia records on j_nacho_kirlia AND j_poke_kirlia', l);
  ok(same(l.j_poke_ninjask, { win: 6, poke: 6 }) && same(l.j_sonfive_ninjask, { win: 6, poke: 6 }) && !l.j_poke_joker, "Pokermon+'s Ninjask too; other keys get no twin", l);
  ok(n === 5, 'five jokers improved', n);
  const e = JSON.parse(store.get('micatro_joker_earned_v1:guest') || '{}');
  ok(e.j_poke_kirlia && e.j_poke_kirlia.win > 0, "the twin's earn time is stamped (the re-earn rule)", e);
  ok(S.recordWin({ jokers: ['j_nacho_kirlia', 'j_poke_kirlia'], stake: 6 }) === 0, 'holding both: one record each, no double count');
});

// ===================================================================== revocations still apply after the merge
await sec('revoked (account)', async () => {
  store.clear();
  const pushes = [];
  const row = {
    wins: { j_nacho_gardevoir: { win: 8, poke: 8 }, j_poke_gardevoir: { win: 2 }, j_nacho_salamence: { win: 7 }, j_nacho_bagon: { nuz: 4 } },
    revoked: { j_poke_gardevoir: ['poke'], j_poke_salamence: true, j_poke_bagon: { cats: ['nuz'], at: 1000 } },
  };
  const account = {
    fetch: async () => ({ wins: JSON.parse(JSON.stringify(row.wins)), revoked: row.revoked, earned: {} }),
    push: async (w, o) => { pushes.push({ w, o }); return { wins: w, revoked: row.revoked, earned: (o && o.earned) || {} }; },
  };
  S.initWinStickers('alice', account);
  await tick(20);
  ok(same(S.winRecord('j_poke_gardevoir'), { win: 8 }), "Gardevoir: Nacho's win 8 merges in, its revoked Pikachu (poke) doesn't", S.winRecord('j_poke_gardevoir'));
  ok(S.winLevel('j_poke_salamence') === 0 && S.winStickerInfo('j_poke_salamence', true) === null, 'Salamence revoked outright: no sticker though j_nacho_salamence has a Win', S.winRecord('j_poke_salamence'));
  ok(S.winStickerInfo('j_nacho_salamence', true).level === 7 && same(S.winRecord('j_nacho_gardevoir'), { win: 8, poke: 8 }), 'the legacy keys keep their own (not revoked) stickers');
  ok(S.winLevel('j_poke_bagon') === 0, 'Bagon: the revoked Aipom (nuz, with `at`) is not restored by the old legacy win');
  const m = S.stickerMap(['j_poke_gardevoir', 'j_poke_salamence', 'j_nacho_salamence']);
  ok(same(m.j_poke_gardevoir, { win: 8 }) && !m.j_poke_salamence && m.j_nacho_salamence.win === 7, 'stickerMap respects them', m);
  const rv = S.stickerRevokedMap(['j_poke_gardevoir', 'j_poke_salamence', 'j_nacho_salamence', 'j_joker']);
  ok(same(Object.keys(rv).sort(), ['j_poke_gardevoir', 'j_poke_salamence']) && same(rv.j_poke_gardevoir.cats, ['poke']), 'stickerRevokedMap: the listed twins with a revocation', rv);
  // a NEW win with the legacy Bagon after the revocation's `at`: recorded on j_poke_bagon with its earn time -> the re-earn rule keeps it
  S.recordWin({ jokers: ['j_nacho_bagon'], stake: 3, categories: ['nuz'] });
  await tick(1700);
  ok(S.winRecord('j_poke_bagon').nuz === 3, 'a new legacy Bagon win after the revocation re-earns the twin (recorded on j_poke_bagon)', S.winRecord('j_poke_bagon'));
  const last = pushes[pushes.length - 1];
  ok(last && last.w.j_poke_bagon && last.w.j_poke_bagon.nuz === 3 && last.o.earned.j_poke_bagon && last.o.earned.j_poke_bagon.nuz > 1000, 'the push carries j_poke_bagon and its earn time (the server accepts a re-earn)', last && { w: last.w.j_poke_bagon, e: last.o.earned });
  S.initWinStickers('guest');   // stop alice's sync
});

// ===================================================================== a watched player's stickers (spectate / replay / the wiki)
await sec('source', () => {
  store.clear();
  S.initWinStickers('guest');
  S.setStickerSource({ j_nacho_ralts: { win: 7 }, j_poke_kirlia: { win: 1 }, j_nacho_kirlia: { mono: 5 } });
  ok(S.winStickerInfo('j_poke_ralts', true).level === 7, "a watched player's legacy record counts toward the twin");
  ok(S.winStickerInfo('j_poke_kirlia', true).category === 'mono', '... max per category (an older replay / the raw account record)');
  S.setStickerSource({ j_nacho_ralts: { win: 7 }, j_poke_ralts: { win: 1 } }, { j_poke_ralts: { cats: ['win'], at: null } });
  ok(S.winStickerInfo('j_poke_ralts', true).level === 1, "with that player's revocations: a revoked twin category is not restored from the legacy key");
  ok(same(S.stickerSource(), { j_nacho_ralts: { win: 7 }, j_poke_ralts: { win: 1 } }), 'stickerSource() still returns the map');
  S.setStickerSource(null);
  ok(S.winStickerInfo('j_poke_ralts', true) === null, 'back to the own (empty) record');
});

// ===================================================================== Pokermon+'s Nincada-line option: hidden, value kept
await sec('nincada option', () => {
  const list = MODS.modOptionList('pokermonplus').map((o) => o.key);
  ok(!list.includes('nincada'), "Pokermon+'s options list no 'Nincada line' (base Pokermon supersedes the whole line)", list);
  // (Pokermon+ 1.2.0, batch 20: 14 line / item options; the dropped Croagunk / Vullaby lines are legacy, their options hidden too)
  ok(list.includes('heatran') && list.includes('timerball') && !list.includes('croagunk') && !list.includes('vullaby') && list.length === 14, 'the other 14 options still listed', list);
  ok(typeof MODS.optionHidden === 'function' && MODS.optionHidden(MODS.MODS.pokermonplus.options.nincada) && MODS.optionHidden(MODS.MODS.pokermonplus.options.croagunk) && !MODS.optionHidden(MODS.MODS.pokermonplus.options.darkrai), 'optionHidden: nincada yes (and the legacy croagunk), darkrai no');
  ok('nincada' in MODS.MODS.pokermonplus.options && MODS.MODS.pokermonplus.options.nincada.default === true, 'the option itself is still declared (default on)');
  newRun({ seed: 'SMNIN', back: 'b_red', mods: ['pokermon', 'pokermonplus'] });
  ok(opt('pokermonplus', 'nincada') === true, 'its value is still filled (default on) and read');
  newRun({ seed: 'SMNIN2', back: 'b_red', mods: ['pokermon', 'pokermonplus'], modOptions: { pokermonplus: { nincada: false } } });
  ok(opt('pokermonplus', 'nincada') === false, 'a stored nincada: false still loads and reads');
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
