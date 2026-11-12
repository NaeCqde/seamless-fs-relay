import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/index';
import { context, makeEnv, tokenA, tokenB } from './helpers';

type Call = { url: string; method: string; body: string; headers: Record<string, string> };

let calls: Call[];
let unreachable: Set<string>;

beforeEach(() => {
	calls = [];
	unreachable = new Set();
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		const origin = url.replace(/\/$/, '');
		calls.push({ url, method: init.method!, body: init.body as string, headers: init.headers as Record<string, string> });
		if (unreachable.has(origin)) throw new Error('connection refused');
		return new Response(null, { status: 200 });
	});
});
afterEach(() => vi.unstubAllGlobals());

const A = 'https://a.example.com';
const B = 'https://b.example.com';

function call(method: string, token: string | null, body: unknown, query = '') {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = 'Bearer ' + token;
	return new Request('https://relay.example.com/' + query, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

const file = (name: string) => ({ parent: '/', name, size: 1 });

describe('the relay', () => {
	it('refuses what it should', async () => {
		const env = await makeEnv();
		const ctx = context();
		expect((await handle(new Request('https://r/', { method: 'GET' }), env, ctx)).status).toBe(405);
		expect((await handle(call('PUT', null, { origin: A }), env, ctx)).status).toBe(401);
		expect((await handle(call('PUT', 'wrong', { origin: A }), env, ctx)).status).toBe(401);
		expect((await handle(call('PUT', tokenA, 'nope'), env, ctx)).status).toBe(400);
		expect((await handle(call('PUT', tokenA, { files: [] }), env, ctx)).status).toBe(400);
		expect((await handle(call('PUT', tokenA, 'x'.repeat(600 * 1024)), env, ctx)).status).toBe(413);
		expect(calls).toEqual([]);
	});

	it('lets a server speak only for itself', async () => {
		const env = await makeEnv();
		const ctx = context();
		// the token of A, the address of B
		expect((await handle(call('PUT', tokenA, { origin: B, files: [file('x')] }), env, ctx)).status).toBe(403);
		expect((await handle(call('DELETE', tokenA, { origin: B }), env, ctx)).status).toBe(403);
		// an address that is in nobody's list
		expect((await handle(call('PUT', tokenA, { origin: 'https://evil.example.com', files: [] }), env, ctx)).status).toBe(403);
		expect(env.KV.data.size).toBe(0);
		expect(calls).toEqual([]);
	});

	it('does not run without its settings', async () => {
		const ctx = context();
		expect((await handle(call('PUT', tokenA, { origin: A }), await makeEnv({ SERVERS: 'oops' }), ctx)).status).toBe(500);
		expect((await handle(call('PUT', tokenA, { origin: A }), await makeEnv({ RELAY_PRIVATE_KEY: '' }), ctx)).status).toBe(500);
	});

	it('stores the files, and tells the others only when they changed', async () => {
		const env = await makeEnv();
		let ctx = context();

		// A comes first: nobody else is online
		expect((await handle(call('PUT', tokenA, { origin: A, files: [file('one')] }, '?first=true'), env, ctx)).status).toBe(200);
		await ctx.settle();
		expect(env.KV.data.get('files:' + A)).toBe('[{"parent":"/","name":"one","size":1}]');
		expect(calls).toEqual([]);

		// B comes: A is told about B, and B gets the files of A
		ctx = context();
		await handle(call('PUT', tokenB, { origin: B, files: [file('two')] }, '?first=true'), env, ctx);
		await ctx.settle();
		expect(calls.map((c) => `${c.method} ${c.url}`).sort()).toEqual([`PUT ${A}/`, `PUT ${B}/`]);
		const toA = calls.find((c) => c.url === A + '/')!;
		expect(JSON.parse(toA.body)).toEqual({ origin: B, files: [{ parent: '/', name: 'two', size: 1 }] });
		const toB = calls.find((c) => c.url === B + '/')!;
		expect(JSON.parse(toB.body)).toEqual({ origin: A, files: [{ parent: '/', name: 'one', size: 1 }] });
		// every call is signed
		for (const c of calls) {
			expect(c.headers['x-relay-signature']).toMatch(/^[A-Za-z0-9_-]{86}$/);
			expect(c.headers['x-relay-timestamp']).toMatch(/^\d+$/);
			expect(c.headers.authorization).toBeUndefined();
		}

		// the same files again: nothing to tell
		calls.length = 0;
		ctx = context();
		await handle(call('PUT', tokenB, { origin: B, files: [file('two')] }), env, ctx);
		await ctx.settle();
		expect(calls).toEqual([]);

		// "first=false" is not "first"
		ctx = context();
		await handle(call('PUT', tokenB, { origin: B, files: [file('two')] }, '?first=false'), env, ctx);
		await ctx.settle();
		expect(calls).toEqual([]);

		// other files: A is told
		ctx = context();
		await handle(call('PUT', tokenB, { origin: B, files: [file('three')] }), env, ctx);
		await ctx.settle();
		expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`PUT ${A}/`]);
	});

	it('does not pass on a link a server made up', async () => {
		const env = await makeEnv();
		let ctx = context();
		await handle(call('PUT', tokenA, { origin: A, files: [] }, '?first=true'), env, ctx);
		ctx = context();
		await handle(call('PUT', tokenB, { origin: B, files: [{ parent: '/', name: 'x', size: 1, url: 'https://evil.example.com/x', origin: 'https://evil.example.com' }] }, '?first=true'), env, ctx);
		await ctx.settle();
		const toA = calls.find((c) => c.url === A + '/')!;
		expect(toA.body).not.toContain('evil');
	});

	it('removes a server that goes, and tells the others', async () => {
		const env = await makeEnv();
		let ctx = context();
		await handle(call('PUT', tokenA, { origin: A, files: [file('one')] }, '?first=true'), env, ctx);
		await handle(call('PUT', tokenB, { origin: B, files: [file('two')] }, '?first=true'), env, ctx);
		await ctx.settle();
		calls.length = 0;

		ctx = context();
		expect((await handle(call('DELETE', tokenB, { origin: B }), env, ctx)).status).toBe(200);
		await ctx.settle();
		expect(env.KV.data.has('files:' + B)).toBe(false);
		expect(env.KV.data.has('files:' + A)).toBe(true);
		expect(calls.map((c) => `${c.method} ${c.url} ${c.body}`)).toEqual([`DELETE ${A}/ {"origin":"${B}"}`]);
	});

	it('forgets a server that does not answer', async () => {
		const env = await makeEnv();
		let ctx = context();
		await handle(call('PUT', tokenA, { origin: A, files: [file('one')] }, '?first=true'), env, ctx);
		await ctx.settle();
		unreachable.add(A);
		calls.length = 0;

		ctx = context();
		await handle(call('PUT', tokenB, { origin: B, files: [file('two')] }, '?first=true'), env, ctx);
		await ctx.settle();
		expect(env.KV.data.has('files:' + A)).toBe(false);
		expect(env.KV.data.has('files:' + B)).toBe(true);
	});
});
