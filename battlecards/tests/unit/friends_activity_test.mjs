// friends_activity_test.mjs — the friends-list "what game is my friend in?" logic
// in site/topbar.js. That module is browser-only (window/document/imports), so —
// like the server tests — we brace-extract the pure friendActivity() + its
// CARD_MODE_LABEL table from source and exercise them with a stub isOnline.
import fs from 'fs';

const src = fs.readFileSync(new URL('../../../site/topbar.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// pull the single-line CARD_MODE_LABEL object literal
const objM = src.match(/const CARD_MODE_LABEL = (\{[^}]*\});/);
if (!objM) throw new Error('CARD_MODE_LABEL not found');
const CARD_MODE_LABEL = new Function('return ' + objM[1])();

// brace-match `function friendActivity(f) { ... }`
function extractFn(name) {
	const i = src.indexOf('function ' + name);
	if (i < 0) throw new Error('not found: ' + name);
	let depth = 0, started = false, k = i;
	for (; k < src.length; k++) {
		if (src[k] === '{') { depth++; started = true; }
		else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } }
	}
	return src.slice(i, k);
}
const stubOnline = f => !!f._online; // test-controlled online bit
const friendActivity = new Function('isOnline', 'CARD_MODE_LABEL', extractFn('friendActivity') + '; return friendActivity;')(stubOnline, CARD_MODE_LABEL);

// --- every card mode maps to a human label + is spectatable ---
const A = friendActivity({ status: 'card:dungeon', region: 'Volcano · Lv 3', _online: true });
ok('a dungeon run is live + labeled', A.live && A.kind === 'card' && /Dungeon run/i.test(A.label), A.label);
ok('run progress (region) is appended', /Volcano · Lv 3/.test(A.label), A.label);
ok('a heist run shows "a Heist run"', /Heist run/i.test(friendActivity({ status: 'card:heist', region: 'Fight 3/8' }).label));
ok('a tombs run shows "a Tombs run"', /Tombs run/i.test(friendActivity({ status: 'card:tombs', region: 'Fight 2/8' }).label));
ok('a duels run shows "a Duels run"', /Duels run/i.test(friendActivity({ status: 'card:duels', region: '5W / 2L' }).label));
ok('an ARENA run shows "an Arena run" (was the gap)', /Arena run/i.test(friendActivity({ status: 'card:arena', region: '3W / 0L' }).label));
ok('a pvp duel shows "a card duel"', /card duel/i.test(friendActivity({ status: 'card:pvp', region: 'Card Duel' }).label));
ok('the generic "Card Duel" region is NOT appended (avoids "duel · Card Duel")', !/·/.test(friendActivity({ status: 'card:pvp', region: 'Card Duel' }).label));
ok('a plain card battle shows "a card battle"', /card battle/i.test(friendActivity({ status: 'card:battle', region: 'Card Battle' }).label));
ok('an unknown card mode still reads as live + generic', friendActivity({ status: 'card:mystery' }).live && /a card game/i.test(friendActivity({ status: 'card:mystery' }).label));

// --- pokemon + non-live states ---
const P = friendActivity({ status: 'battling:m_abc' });
ok('a pokemon battle is live with its matchId (for Overworld spectate)', P.live && P.kind === 'pokemon' && P.matchId === 'm_abc', JSON.stringify(P));
ok('an exploring friend is not live', !friendActivity({ status: 'visiting:PalletTown' }).live);
ok('an idle online friend reads "online", not live', (() => { const a = friendActivity({ status: '', _online: true }); return !a.live && a.label === 'online'; })());
ok('an offline friend reads "offline"', friendActivity({ status: '' }).label === 'offline');

// --- source guards: the Watch button + routing must stay wired ---
ok('renderFriends shows a Watch button for a live friend', /act\.live/.test(src) && /Watch/.test(src) && /watchFriend\(f\)/.test(src));
ok('watchFriend routes a card game to ?spectate=', /watchFriend/.test(src) && /battlecards\/\?spectate=/.test(src));
ok('watchFriend routes a pokemon battle to the Overworld watch', /overworld\/\?mp=1&watch=/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
