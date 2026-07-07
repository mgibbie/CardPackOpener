// Local dev server for /magepunktest: static files + the real /api/mp
// function handler, with accounts stored in a local JSON file instead of
// Netlify Blobs. Production behavior is identical code — mp.mjs switches
// stores when MP_DEV_STORE is set.
//
//   node mp-dev-server.mjs [port]     (default 8767)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSync } from 'esbuild';

process.env.MP_DEV_STORE = process.env.MP_DEV_STORE || join(tmpdir(), 'mp-dev-users.json');
console.log('accounts file:', process.env.MP_DEV_STORE);

// bundle the function exactly like Netlify's esbuild does, then import it
const bundle = join(mkdtempSync(join(tmpdir(), 'mp-fn-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: ['netlify/functions/mp.mjs'],
	bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const { default: handler } = await import('file://' + bundle.replace(/\\/g, '/'));

const MIME = {
	'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
	'.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

const port = +(process.argv[2] || 8767);
createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${port}`);
	if (url.pathname === '/api/mp' || url.pathname === '/.netlify/functions/mp') {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const request = new Request(`http://localhost${url.pathname}`, {
			method: req.method,
			headers: req.headers,
			body: chunks.length ? Buffer.concat(chunks) : undefined,
		});
		const out = await handler(request);
		res.writeHead(out.status, Object.fromEntries(out.headers));
		res.end(Buffer.from(await out.arrayBuffer()));
		return;
	}
	// static: mirror Netlify's publish="." + directory index behavior
	let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
	if (p === '' || p.endsWith('/') || p.endsWith('\\')) p = join(p, 'index.html');
	if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
	if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
	res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
	res.end(readFileSync(p));
}).listen(port, () => console.log(`mp dev server: http://localhost:${port}/magepunktest/`));
