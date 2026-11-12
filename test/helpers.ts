import { RelaySigner } from '../src/sign';
import { sha256Hex } from '../src/crypto';

export const SEED = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc'; // 0x07 x 32
export const PUBLIC = '6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw';

export class FakeKV {
	data = new Map<string, string>();
	async get(key: string) {
		return this.data.get(key) ?? null;
	}
	async put(key: string, value: string) {
		this.data.set(key, value);
	}
	async delete(key: string) {
		this.data.delete(key);
	}
	async list({ prefix = '' }: { prefix?: string; cursor?: string }) {
		return { keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: '' };
	}
}

export const tokenA = 'a'.repeat(43);
export const tokenB = 'b'.repeat(43);

export async function makeEnv(extra: Record<string, string> = {}) {
	const servers = {
		'https://a.example.com': await sha256Hex(tokenA),
		'https://b.example.com/': await sha256Hex(tokenB),
	};
	return { KV: new FakeKV(), SERVERS: JSON.stringify(servers), RELAY_PUBLIC_KEY: PUBLIC, RELAY_PRIVATE_KEY: SEED, ...extra } as unknown as Env & { KV: FakeKV };
}

export async function signer() {
	return RelaySigner.create(SEED, PUBLIC);
}

/** Collects the waitUntil promises, so that a test can wait for the pushes. */
export function context() {
	const pending: Promise<unknown>[] = [];
	return { waitUntil: (p: Promise<unknown>) => void pending.push(p), settle: () => Promise.all(pending) };
}
