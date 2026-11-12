import { sha256Hex, toBase64Url } from './crypto';

/** What is signed: the method, the address of the server the call is for, the time, and the SHA-256 of the body. */
export function signingMessage(method: string, origin: string, timestamp: string, bodyHash: string): string {
	return `sfs-relay v1\n${method}\n${origin}\n${timestamp}\n${bodyHash}`;
}

/** Signs what the relay sends to the servers. Only the relay has the private key; the servers know the public one. */
export class RelaySigner {
	private constructor(private readonly key: CryptoKey) {}

	/** `privateKey` is the seed and `publicKey` the public key, both base64url (`sfs keygen` makes them). */
	static async create(privateKey: string, publicKey: string): Promise<RelaySigner> {
		if (!privateKey || !publicKey) throw new Error('RELAY_PRIVATE_KEY and RELAY_PUBLIC_KEY must be set');
		const key = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', d: privateKey, x: publicKey }, { name: 'Ed25519' }, false, ['sign']);
		return new RelaySigner(key);
	}

	/** The headers of a call to the server `origin`. */
	async headers(method: string, origin: string, body: string, now = Math.floor(Date.now() / 1000)): Promise<Record<string, string>> {
		const timestamp = String(now);
		const message = signingMessage(method, origin, timestamp, await sha256Hex(body));
		const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, this.key, new TextEncoder().encode(message)));
		return {
			'content-type': 'application/json',
			'x-relay-timestamp': timestamp,
			'x-relay-signature': toBase64Url(signature),
		};
	}
}
