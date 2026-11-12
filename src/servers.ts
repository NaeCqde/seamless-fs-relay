import { constantTimeEqual, sha256Hex } from './crypto';

/** Servers are written the same way here and in the servers themselves (`sfs`): lower case host, no default port, no trailing slash. */
export function normalizeOrigin(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (url.username || url.password || url.search || url.hash) return null;
	return url.href.replace(/\/+$/, '');
}

/**
 * `SERVERS` is a JSON object: the address of each server, and the SHA-256 of its token. The relay keeps nothing else of the tokens,
 * and it talks only to the addresses written here.
 */
export function parseServers(text: string): Map<string, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('SERVERS is not JSON');
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('SERVERS must be an object');

	const servers = new Map<string, string>();
	for (const [address, hash] of Object.entries(parsed)) {
		const origin = normalizeOrigin(address);
		if (origin === null) throw new Error(`SERVERS: ${address} is not an http(s) address`);
		if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`SERVERS: the hash of ${address} must be 64 hex digits (lower case)`);
		if (servers.has(origin)) throw new Error(`SERVERS: ${address} is there twice`);
		servers.set(origin, hash);
	}
	const hashes = new Set(servers.values());
	if (hashes.size !== servers.size) throw new Error('SERVERS: two servers have the same token');
	return servers;
}

/** The server that owns this token, or null. Every entry is compared, so the time does not tell which one matched. */
export async function authenticate(servers: Map<string, string>, token: string): Promise<string | null> {
	const presented = await sha256Hex(token);
	let found: string | null = null;
	for (const [origin, hash] of servers) {
		if (constantTimeEqual(presented, hash)) found = origin;
	}
	return found;
}

/** The token of `Authorization: Bearer <token>`. */
export function bearerToken(header: string | null): string | null {
	const match = header?.match(/^Bearer ([^\s]+)$/);
	return match ? match[1] : null;
}
