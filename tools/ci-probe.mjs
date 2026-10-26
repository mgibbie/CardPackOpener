// TEMP (debug, removed before review): what a CI Chrome supports
import puppeteer from 'puppeteer-core';
const probe = () => {
	const mm = q => matchMedia(q).matches;
	return { pointerFine: mm('(pointer: fine)'), pointerNone: mm('(pointer: none)'), hover: mm('(hover: hover)'), anyHover: mm('(any-hover: hover)'), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
};
for (const extra of [[], ['--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2']]) {
	const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', ...extra] });
	const p = await b.newPage();
	console.log('headless', JSON.stringify(extra), JSON.stringify(await p.evaluate(probe)));
	try {
		const s = await p.createCDPSession();
		await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }, { name: 'any-hover', value: 'hover' }, { name: 'any-pointer', value: 'fine' }] });
		console.log('  + setEmulatedMedia', JSON.stringify(await p.evaluate(probe)));
	} catch (e) { console.log('  setEmulatedMedia failed', e.message); }
	await b.close();
}
if (process.env.DISPLAY) {
	const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: false, args: ['--no-sandbox'] });
	const p = await b.newPage();
	console.log('headful (Xvfb)', JSON.stringify(await p.evaluate(probe)));
	await b.close();
}
