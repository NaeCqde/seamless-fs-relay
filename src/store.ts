const PREFIX = 'files:';

/** The files that each server last told us, one KV entry per server. A server that has an entry is online. */
export class Store {
	constructor(private readonly kv: KVNamespace) {}

	get(origin: string): Promise<string | null> {
		return this.kv.get(PREFIX + origin);
	}

	put(origin: string, filesJson: string): Promise<void> {
		return this.kv.put(PREFIX + origin, filesJson);
	}

	delete(origin: string): Promise<void> {
		return this.kv.delete(PREFIX + origin);
	}

	async online(): Promise<string[]> {
		const origins: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await this.kv.list({ prefix: PREFIX, cursor });
			for (const key of page.keys) origins.push(key.name.slice(PREFIX.length));
			cursor = page.list_complete ? undefined : page.cursor;
		} while (cursor);
		return origins;
	}
}
