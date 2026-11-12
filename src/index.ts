import { bearerToken, authenticate, normalizeOrigin, parseServers } from './servers';
import { MAX_BODY, parsePayload } from './payload';
import { push } from './push';
import { RelaySigner } from './sign';
import { Store } from './store';

interface Context {
	waitUntil(promise: Promise<unknown>): void;
}

let signer: Promise<RelaySigner> | undefined;
let signerFor = '';
function getSigner(env: Env): Promise<RelaySigner> {
	const id = env.RELAY_PUBLIC_KEY + '|' + env.RELAY_PRIVATE_KEY;
	if (!signer || signerFor !== id) {
		signerFor = id;
		signer = RelaySigner.create(env.RELAY_PRIVATE_KEY, env.RELAY_PUBLIC_KEY);
		signer.catch(() => (signer = undefined));
	}
	return signer;
}

const text = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export default {
	async fetch(request, env, context): Promise<Response> {
		return handle(request, env, context);
	},
} satisfies ExportedHandler<Env>;

export async function handle(request: Request, env: Env, context: Context): Promise<Response> {
	if (request.method !== 'PUT' && request.method !== 'DELETE') {
		return new Response('method not allowed', { status: 405, headers: { allow: 'PUT, DELETE' } });
	}

	let servers: Map<string, string>;
	let relaySigner: RelaySigner;
	try {
		servers = parseServers(env.SERVERS);
		relaySigner = await getSigner(env);
	} catch (e) {
		console.log('settings are wrong: ' + (e instanceof Error ? e.message : e));
		return text(500, 'the relay is not set up');
	}

	// Who is calling: the server whose token this is.
	const token = bearerToken(request.headers.get('authorization'));
	const caller = token === null ? null : await authenticate(servers, token);
	if (caller === null) return text(401, 'unauthorized');

	const length = Number(request.headers.get('content-length') ?? 0);
	if (length > MAX_BODY) return text(413, 'too large');
	const body = await request.text();
	if (body.length > MAX_BODY) return text(413, 'too large');

	const parsed = parsePayload(body);
	if (!parsed.ok) return text(400, parsed.error);
	const { payload } = parsed;

	// A server can speak only for itself, whatever address it writes.
	if (normalizeOrigin(payload.origin) !== caller) return text(403, 'origin does not belong to this token');

	const store = new Store(env.KV);
	const first = new URL(request.url).searchParams.get('first') === 'true';

	if (request.method === 'DELETE') {
		await store.delete(caller);
		context.waitUntil(notifyGone(store, relaySigner, servers, caller));
	} else {
		const files = payload.files ?? [];
		const filesJson = JSON.stringify(files);
		const changed = (await store.get(caller)) !== filesJson;
		if (changed) await store.put(caller, filesJson);
		if (first || changed) context.waitUntil(spread(store, relaySigner, servers, caller, files, first));
	}
	return new Response(null);
}

/** The other servers that are online (and still in the list of servers). */
async function others(store: Store, servers: Map<string, string>, self: string): Promise<string[]> {
	return (await store.online()).filter((origin) => origin !== self && servers.has(origin));
}

/** Tells the other servers about `origin`'s files; a server that has just come gets the files of all the others. */
async function spread(store: Store, signer: RelaySigner, servers: Map<string, string>, origin: string, files: unknown[], first: boolean) {
	const targets = await others(store, servers, origin);
	const announcement = JSON.stringify({ origin, files });

	await Promise.all(
		targets.map(async (target) => {
			if ((await push(signer, target, 'PUT', announcement)) === 'unreachable') await forget(store, signer, servers, target);
		}),
	);

	if (first) {
		// the new server gets what the others have; it is not checked, it may be still starting
		await Promise.all(
			targets.map(async (target) => {
				const stored = await store.get(target);
				if (stored !== null) await push(signer, origin, 'PUT', JSON.stringify({ origin: target, files: JSON.parse(stored) }));
			}),
		);
	}
}

async function notifyGone(store: Store, signer: RelaySigner, servers: Map<string, string>, origin: string) {
	const body = JSON.stringify({ origin });
	await Promise.all((await others(store, servers, origin)).map((target) => push(signer, target, 'DELETE', body)));
}

/** A server that does not answer is taken off the list, and the others are told. */
async function forget(store: Store, signer: RelaySigner, servers: Map<string, string>, origin: string) {
	await store.delete(origin);
	await notifyGone(store, signer, servers, origin);
}
