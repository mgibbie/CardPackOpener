// Regenerate server/correspondence-bans.json — the card ids banned from the
// correspondence (play-by-mail) format: everything that counters spells.
// The MP backend rejects async decks containing any of these at create/accept.
// Rerun whenever battlecards/cards.json gains/loses counter cards; CI enforces
// the sync via battlecards/tests/unit/correspondence_bans_sync_test.mjs.
//
//   node tools/gen-correspondence-bans.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isCounterCard } from '../battlecards/format.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export function buildBans(cards) {
	return cards.filter(c => !c.token && isCounterCard(c)).map(c => c.id).sort();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const cards = JSON.parse(readFileSync(join(ROOT, 'battlecards/cards.json'), 'utf8')).cards;
	const bans = buildBans(cards);
	writeFileSync(join(ROOT, 'server/correspondence-bans.json'), JSON.stringify(bans, null, '\t') + '\n');
	console.log(`correspondence-bans: ${bans.length} banned ids written.`);
}
