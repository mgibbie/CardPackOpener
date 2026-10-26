// TEMP (debug, removed before review): what a CI Chrome supports
import puppeteer from 'puppeteer-core';
for (const extra of [[], ['--enable-unsafe-swiftshader'], ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']]) {
	const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', ...extra] });
	const p = await b.newPage();
	const r = await p.evaluate(() => {
		const c = document.createElement('canvas');
		const gl = c.getContext('webgl'), gl2 = document.createElement('canvas').getContext('webgl2');
		const mm = q => matchMedia(q).matches;
		return { webgl: !!gl, webgl2: !!gl2, renderer: gl ? gl.getParameter(gl.RENDERER) : null, pointerFine: mm('(pointer: fine)'), pointerCoarse: mm('(pointer: coarse)'), pointerNone: mm('(pointer: none)'), hover: mm('(hover: hover)'), anyPointerFine: mm('(any-pointer: fine)'), touch: navigator.maxTouchPoints, cs: typeof CompressionStream, gp: typeof navigator.getGamepads, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language };
	});
	console.log(JSON.stringify(extra), JSON.stringify(r));
	await b.close();
}
