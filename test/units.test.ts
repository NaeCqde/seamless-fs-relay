import { describe, expect, it } from 'vitest';
import { constantTimeEqual, sha256Hex } from '../src/crypto';
import { cleanFiles, normalizeDir, parsePayload } from '../src/payload';
import { authenticate, bearerToken, normalizeOrigin, parseServers } from '../src/servers';
import { signingMessage } from '../src/sign';
import { PUBLIC, SEED, signer } from './helpers';

describe('crypto', () => {
	it('hashes like sha256sum', async () => {
		expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
	it('compares exactly', () => {
		expect(constantTimeEqual('abc', 'abc')).toBe(true);
		expect(constantTimeEqual('abc', 'abd')).toBe(false);
		expect(constantTimeEqual('abc', 'abcd')).toBe(false);
		expect(constantTimeEqual('', '')).toBe(true);
	});
});

describe('servers', () => {
	const hash = 'a'.repeat(64);
	it('writes addresses the way the servers do', () => {
		expect(normalizeOrigin('https://A.example.com/')).toBe('https://a.example.com');
		expect(normalizeOrigin('http://localhost:8080')).toBe('http://localhost:8080');
		expect(normalizeOrigin('https://a.example.com:443')).toBe('https://a.example.com');
		expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
		expect(normalizeOrigin('https://user:pw@a.example.com')).toBeNull();
		expect(normalizeOrigin('nonsense')).toBeNull();
	});
	it('accepts a good list and refuses bad ones', () => {
		expect([...parseServers(JSON.stringify({ 'https://a.example.com/': hash })).keys()]).toEqual(['https://a.example.com']);
		expect(() => parseServers('nope')).toThrow();
		expect(() => parseServers('[]')).toThrow();
		expect(() => parseServers(JSON.stringify({ 'ftp://a.example.com': hash }))).toThrow();
		expect(() => parseServers(JSON.stringify({ 'https://a.example.com': 'abc' }))).toThrow();
		expect(() => parseServers(JSON.stringify({ 'https://a.example.com': hash.toUpperCase() }))).toThrow();
		expect(() => parseServers(JSON.stringify({ 'https://a.example.com': hash, 'https://a.example.com/': hash }))).toThrow();
		expect(() => parseServers(JSON.stringify({ 'https://a.example.com': hash, 'https://b.example.com': hash }))).toThrow();
	});
	it('finds the server of a token', async () => {
		const servers = parseServers(JSON.stringify({ 'https://a.example.com': await sha256Hex('token-a'), 'https://b.example.com': await sha256Hex('token-b') }));
		expect(await authenticate(servers, 'token-b')).toBe('https://b.example.com');
		expect(await authenticate(servers, 'token-c')).toBeNull();
		expect(await authenticate(servers, '')).toBeNull();
	});
	it('reads the bearer token', () => {
		expect(bearerToken('Bearer abc')).toBe('abc');
		expect(bearerToken('abc')).toBeNull();
		expect(bearerToken('Bearer ')).toBeNull();
		expect(bearerToken(null)).toBeNull();
	});
});

describe('payload', () => {
	it('writes directories with a slash at both ends', () => {
		expect(normalizeDir('')).toBe('/');
		expect(normalizeDir('a//b/./')).toBe('/a/b/');
		expect(normalizeDir('/a/../b')).toBeNull();
		expect(normalizeDir('a\\b')).toBeNull();
	});
	it('keeps only parent, name and size, and sorts', () => {
		const files = cleanFiles([
			{ parent: '/b/', name: 'z', size: 1, url: 'https://evil.example.com', origin: 'https://evil.example.com' },
			{ parent: 'a', name: 'y', size: 2 },
			{ parent: '/a/', name: 'x', size: 3 },
		]);
		expect(files).toEqual([
			{ parent: '/a/', name: 'x', size: 3 },
			{ parent: '/a/', name: 'y', size: 2 },
			{ parent: '/b/', name: 'z', size: 1 },
		]);
	});
	it('drops odd files', () => {
		expect(cleanFiles([{ parent: '/', name: 'a/b', size: 1 }, { parent: '/..', name: 'a', size: 1 }, { parent: '/', name: '', size: 1 }, { parent: '/', name: 'a', size: -1 }, { parent: '/', name: 'a', size: 1.5 }, { parent: 1, name: 'a', size: 1 }, null, 'x'])).toEqual([]);
	});
	it('parses', () => {
		expect(parsePayload('{"origin":"https://a.example.com"}')).toEqual({ ok: true, payload: { origin: 'https://a.example.com' } });
		expect(parsePayload('nope').ok).toBe(false);
		expect(parsePayload('[]').ok).toBe(false);
		expect(parsePayload('{}').ok).toBe(false);
		expect(parsePayload('{"origin":"x","files":{}}').ok).toBe(false);
	});
});

describe('signature', () => {
	// the same message, seed and result as in the Rust test of `sfs` (relay_auth.rs): the two sides agree
	it('is the one the servers check', async () => {
		const body = '{"origin":"https://b.example.com","files":[]}';
		const headers = await (await signer()).headers('PUT', 'https://a.example.com', body, 1_700_000_000);
		expect(headers['x-relay-timestamp']).toBe('1700000000');
		expect(headers['x-relay-signature']).toBe('pkOO0fOehfDn1cbw9uVusxJiUXzuufYbyCC6GA4u9G5Yv2zFy0ntrfykkCDw5dUbp1xVj7Aopb1U0dAR2mwSAg');
		expect(signingMessage('PUT', 'https://a.example.com', '1700000000', await sha256Hex(body))).toContain('sfs-relay v1\nPUT\n');
	});
	it('needs both keys', async () => {
		await expect((await import('../src/sign')).RelaySigner.create('', PUBLIC)).rejects.toThrow();
		await expect((await import('../src/sign')).RelaySigner.create(SEED, '')).rejects.toThrow();
	});
});
