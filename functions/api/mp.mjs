import handler from '../../server/mp.mjs';

export function onRequest(context) {
	return handler(context.request, context.env);
}
