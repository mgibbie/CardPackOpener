// /magepunktest — account door + mode menu. All the actual play happens in
// the battlecards pages with ?mp=1; this page just logs you in and routes.
import * as MP from '../battlecards/mpmode.js';

const $ = id => document.getElementById(id);
let registering = false;

function showAuth() {
	$('app-menu').style.display = 'none';
	$('app-auth').style.display = 'block';
	render();
}

function render() {
	$('go').textContent = registering ? 'Create account' : 'Log in';
	$('flip').textContent = registering ? 'Have an account? Log in' : 'No account? Create one';
}

async function showMenu() {
	$('app-auth').style.display = 'none';
	$('app-menu').style.display = 'block';
	const s = (await MP.freshState()) || MP.cachedState();
	if (!s) return showAuth();
	$('who').textContent = s.username;
	$('npacks').textContent = s.packs;
	const owned = Object.values(s.collection).reduce((a, b) => a + b, 0);
	$('stats').textContent =
		`${owned} cards collected · ${s.stats.runs} runs (${s.stats.wins} wins) · ${s.stats.packsOpened} packs opened`;
}

$('flip').addEventListener('click', () => { registering = !registering; $('err').textContent = ''; render(); });

$('go').addEventListener('click', async () => {
	$('err').textContent = '';
	const data = await MP.auth(registering ? 'register' : 'login', $('u').value, $('p').value);
	if (data.error) { $('err').textContent = data.error; return; }
	showMenu();
});
$('p').addEventListener('keydown', e => { if (e.key === 'Enter') $('go').click(); });

$('logout').addEventListener('click', () => { MP.logout(); showAuth(); });

$('m-dungeon').addEventListener('click', () => location.href = '/battlecards/?dungeon=1&mp=1');
$('m-packs').addEventListener('click', () => location.href = '/battlecards/packs.html?mp=1');
$('m-deck').addEventListener('click', () => location.href = '/battlecards/deck.html?mp=1');
$('m-gallery').addEventListener('click', () => location.href = '/battlecards/viewer.html?mp=1');

if (MP.hasToken()) showMenu(); else showAuth();
