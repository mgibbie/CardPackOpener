// modal_card_tips_test.mjs — every card face you must CHOOSE between shows its
// rules on hover.
//
// The 3D board/hand tooltip resolves cards by raycast uid, which DOM card faces in
// the choice modals don't have — so a Discover offered three cards with no way to
// read them. The run-overlay bucket picks already solved this via
// miniFace -> attachTip (hover on mouse/pen, long-press on touch, rendered by
// showMiniTip at z-index 70 — above the modal at 11 and the run overlay at 60).
// The choice modals now use the same helper.
//
// This is a source guard: a new modal that paints a card face without a tip is a
// blind pick, and that regression is invisible in any state-level test.
//   node battlecards/tests/unit/modal_card_tips_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

// the decision modals a player reads cards in
const MODALS = ['openScryModal', 'openDredgeModal', 'openPickModal', 'openMulliganModal', 'openDiscardModal', 'openSacModal', 'renderSpectatorChoice'];

function bodyOf(name) {
	const i = src.indexOf('function ' + name);
	if (i < 0) return null;
	let depth = 0, started = false, k = i;
	for (; k < src.length; k++) {
		if (src[k] === '{') { depth++; started = true; }
		else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } }
	}
	return src.slice(i, k);
}

for (const name of MODALS) {
	const body = bodyOf(name);
	ok(`${name} exists`, !!body);
	if (!body) continue;
	const faces = (body.match(/drawCardFace\(/g) || []).length;
	const tips = (body.match(/attachTip\(/g) || []).length;
	ok(`${name} paints a card face`, faces > 0, `faces=${faces}`);
	ok(`${name} attaches a hover tip to every face it paints`, tips >= faces, `faces=${faces} tips=${tips}`);
}

// the Discover modal is the one the report was about — pin it explicitly
{
	const body = bodyOf('openPickModal') || '';
	ok('the Discover/Draft modal wires attachTip on its offered cards', /drawCardFace\([\s\S]{0,120}?attachTip\(/.test(body));
}

// a live card instance carries maxHealth, not health — the tip would read "3/undefined"
{
	const bad = MODALS.map(bodyOf).filter(Boolean).join('\n').match(/attachTip\(face, card\)/g) || [];
	ok('no modal passes a raw live card to attachTip (health would be undefined)', bad.length === 0, bad.join(','));
}

// the tip must out-layer what it is drawn over
{
	const miniZ = /id = 'mini-tip'[\s\S]{0,400}?z-index:(\d+)/.exec(src);
	const modalZ = /#scry-modal \{[\s\S]{0,200}?z-index: (\d+)/.exec(html);
	const overlayZ = /dungeon-overlay'[\s\S]{0,300}?z-index:(\d+)/.exec(src);
	ok('the mini tip declares a z-index', !!miniZ, miniZ && miniZ[1]);
	ok('it sits ABOVE the choice modal', miniZ && modalZ && Number(miniZ[1]) > Number(modalZ[1]), miniZ && modalZ && `${miniZ[1]} vs ${modalZ[1]}`);
	ok('it sits ABOVE the run overlay (bucket picks live there)', miniZ && overlayZ && Number(miniZ[1]) > Number(overlayZ[1]), miniZ && overlayZ && `${miniZ[1]} vs ${overlayZ[1]}`);
}

// hover must work for a mouse even on touch-capable hardware
{
	const at = bodyOf('attachTip') || '';
	ok('attachTip gates on the EVENT pointerType, not a global touch flag', /pointerType !== 'touch'/.test(at));
	ok('attachTip shows on hover and hides on leave', /pointerenter/.test(at) && /pointerleave/.test(at));
	ok('attachTip still supports long-press on touch', /pointerdown/.test(at) && /_tipFired/.test(at));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
