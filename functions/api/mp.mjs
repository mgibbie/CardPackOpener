import handler from '../../netlify/functions/mp.mjs';

export function onRequest(context) {
	return handler(context.request, context.env);
}
