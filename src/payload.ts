export interface FileEntry {
	parent: string;
	name: string;
	size: number;
}

export interface Payload {
	origin: string;
	files?: FileEntry[];
}

/** The most a registration may carry (the same limits as the servers have). */
export const MAX_BODY = 500 * 1024;
export const MAX_FILES = 20_000;

/** `a/b` -> `/a/b/`. null if the directory has `..`, a backslash or a control character. */
export function normalizeDir(dir: string): string | null {
	let out = '/';
	for (const segment of dir.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..' || segment.includes('\\') || /[\u0000-\u001f\u007f]/.test(segment)) return null;
		out += segment + '/';
	}
	return out;
}

function validName(name: unknown): name is string {
	return typeof name === 'string' && name !== '' && name !== '.' && name !== '..' && name.length <= 255 && !name.includes('/') && !/[\u0000-\u001f\u007f]/.test(name);
}

/**
 * Only `parent`, `name` and `size` of a file are kept. A server cannot put a link of its own (`url`) or a foreign `origin` into the pages
 * of the other servers: the link to a file is always built from the address of the server it is on.
 * The list is sorted, so that the same files always give the same text (a change is noticed by comparing the texts).
 */
export function cleanFiles(files: unknown[]): FileEntry[] {
	const clean: FileEntry[] = [];
	for (const file of files) {
		if (typeof file !== 'object' || file === null) continue;
		const { parent, name, size } = file as Record<string, unknown>;
		if (typeof parent !== 'string' || !validName(name)) continue;
		if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) continue;
		const dir = normalizeDir(parent);
		if (dir === null) continue;
		clean.push({ parent: dir, name, size });
	}
	return clean.sort((a, b) => (a.parent < b.parent ? -1 : a.parent > b.parent ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export type Parsed = { ok: true; payload: Payload } | { ok: false; error: string };

export function parsePayload(text: string): Parsed {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return { ok: false, error: 'not JSON' };
	}
	if (typeof json !== 'object' || json === null || Array.isArray(json)) return { ok: false, error: 'not an object' };
	const { origin, files } = json as Record<string, unknown>;
	if (typeof origin !== 'string') return { ok: false, error: 'origin is missing' };
	if (files === undefined) return { ok: true, payload: { origin } };
	if (!Array.isArray(files)) return { ok: false, error: 'files must be a list' };
	if (files.length > MAX_FILES) return { ok: false, error: 'too many files' };
	return { ok: true, payload: { origin, files: cleanFiles(files) } };
}
