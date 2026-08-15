// codec_test.mjs — deck-code encode/decode round-trip (battlecards/codec.js).
// Node 18+ has CompressionStream/TextEncoder/btoa, so both the gzip and raw paths
// run here exactly as in the browser.
import { encodeDeck, decodeDeck, packString, unpackString } from '../../codec.js';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const multiset = arr => [...arr].sort().join(',');

// a realistic 40-card deck with duplicates + a commander, no companion
const cards = [];
for (const id of ['fireball', 'frostbolt', 'arcane_missiles', 'mana_wyrm', 'babbling_book', 'flamestrike', 'polymorph', 'water_elemental']) { cards.push(id, id); }
for (const id of ['arcane_intellect', 'blizzard', 'pyroblast', 'ice_block', 'kirin_tor_mage', 'sorcerers_apprentice', 'archmage', 'kabal_crystal_runner', 'medivh_the_guardian', 'antonidas', 'dr_boom', 'the_lich_king']) { cards.push(id, id); }
const deck = { classId: 'mage', cards, commander: 'elise_starseeker', companion: null };
ok('the test deck is 40 cards', cards.length === 40, cards.length);

// --- round-trip (gzip path, since node has CompressionStream) ---
const code = await encodeDeck(deck);
ok('code is a non-empty MPCK string', typeof code === 'string' && /^MPCK/.test(code), code?.slice(0, 12));
ok('gzip path was used (MPCKG1. prefix)', code.startsWith('MPCKG1.'), code.slice(0, 8));
const back = await decodeDeck(code);
ok('classId round-trips', back && back.classId === 'mage', back?.classId);
ok('the full 40-card multiset round-trips', back && multiset(back.cards) === multiset(cards));
ok('duplicate counts are preserved', back && back.cards.filter(x => x === 'fireball').length === 2);
ok('commander round-trips', back && back.commander === 'elise_starseeker', back?.commander);
ok('a null companion round-trips as null', back && back.companion === null, back?.companion);

// --- raw fallback path (no CompressionStream) still round-trips ---
const saved = globalThis.CompressionStream;
delete globalThis.CompressionStream;
const rawCode = await encodeDeck(deck);
globalThis.CompressionStream = saved;
ok('raw fallback uses the MPCK1. prefix', rawCode.startsWith('MPCK1.'), rawCode.slice(0, 8));
const rawBack = await decodeDeck(rawCode); // decodes via the raw branch even with CompressionStream restored
ok('raw code round-trips the deck', rawBack && rawBack.classId === 'mage' && multiset(rawBack.cards) === multiset(cards));
ok('gzip code is shorter than the raw code', code.length < rawCode.length, `${code.length} vs ${rawCode.length}`);

// --- robustness: junk / empty -> null, never a throw ---
ok('garbage input decodes to null', (await decodeDeck('not-a-real-code')) === null);
ok('empty input decodes to null', (await decodeDeck('')) === null);
ok('a truncated code decodes to null (or is caught)', (await decodeDeck('MPCKG1.zzzz')) === null);

// --- commander + companion both present ---
const both = await decodeDeck(await encodeDeck({ classId: 'hunter', cards: ['bearshark', 'bearshark'], commander: 'cmd_x', companion: 'cmp_y' }));
ok('both loadout slots round-trip', both && both.commander === 'cmd_x' && both.companion === 'cmp_y');

// --- generic packString/unpackString (used for replay tapes) ---
const blob = JSON.stringify({ frames: Array.from({ length: 40 }, (_, i) => ({ turn: i, board: ['x', 'y', 'z'], life: 30 - i })) });
const packed = await packString(blob);
ok('packString gzips a repetitive blob (G1. prefix)', packed.startsWith('G1.'), packed.slice(0, 6));
ok('packString shrinks a repetitive blob well', packed.length < blob.length, `${packed.length} vs ${blob.length}`);
ok('unpackString round-trips the exact string', (await unpackString(packed)) === blob);
ok('unpackString on garbage returns null', (await unpackString('nope')) === null);
ok('unpackString on empty returns null', (await unpackString('')) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
