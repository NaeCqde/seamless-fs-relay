// The settings of the worker (wrangler.toml and `wrangler secret put`). `wrangler types` makes a similar file, but it does not know the secret.

interface Env {
	KV: KVNamespace;
	/** JSON: the address of every server and the SHA-256 of its token. */
	SERVERS: string;
	/** The public key of the relay (`sfs keygen`), base64url. */
	RELAY_PUBLIC_KEY: string;
	/** The private key of the relay (`sfs keygen`), base64url. A secret: `wrangler secret put RELAY_PRIVATE_KEY`. */
	RELAY_PRIVATE_KEY: string;
}
