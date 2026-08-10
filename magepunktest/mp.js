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
	$('code').innerHTML = s.friendCode ? `Friend code: <b>${s.friendCode}</b>` : '';
	const owned = Object.values(s.collection).reduce((a, b) => a + b, 0);
	$('stats').textContent =
		`${owned} cards collected · ${s.stats.runs} runs (${s.stats.wins} wins) · ${s.stats.packsOpened} packs opened · ${s.packs} pack${s.packs === 1 ? '' : 's'} unopened`;
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

$('m-world').addEventListener('click', () => location.href = '/overworld/');

if (MP.hasToken()) showMenu(); else showAuth();
