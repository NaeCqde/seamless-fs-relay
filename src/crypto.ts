const encoder = new TextEncoder();

/** SHA-256 as lower case hex, the form in which the hash of a token is written in `SERVERS` (`sfs hash` prints the same). */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
	const bytes = typeof data === 'string' ? encoder.encode(data) : data;
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings in a time that does not depend on where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
	let diff = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i++) {
		diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return diff === 0;
}

export function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
